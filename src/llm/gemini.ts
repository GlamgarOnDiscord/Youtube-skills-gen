import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type {
  GeminiAnalysisResponse,
  SkillCluster,
  Corpus,
} from '../domain/index.ts';
import { GeminiError } from '../domain/index.ts';
import {
  buildAnalysisPrompt,
  buildGenerationPrompt,
  extractSkillContent,
  parseFrontmatter,
} from './prompts.ts';
import {
  chunkCorpus,
  filterCorpusForCluster,
  renderChunkForPrompt,
} from '../chunkers/corpus.ts';
import logger from '../logging/logger.ts';
import { MAX_RETRIES, RETRY_DELAY_BASE_MS } from '../config/defaults.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Gemini client — analysis + generation with retry logic
// ─────────────────────────────────────────────────────────────────────────────

/** Safety settings — relaxed for technical content */
const SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1);
        logger.debug(`Gemini retry ${attempt}/${MAX_RETRIES} for ${context}`);
        await sleep(delay);
      }
      return await fn();
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const msg = lastErr.message;
      // Don't retry auth errors
      if (msg.includes('API_KEY') || msg.includes('401') || msg.includes('403')) break;
      logger.debug(`Gemini error (attempt ${attempt}): ${msg}`);
    }
  }
  throw new GeminiError(`Gemini failed in ${context}: ${lastErr?.message}`, 500);
}

// ── GeminiService ─────────────────────────────────────────────────────────────

export class GeminiService {
  private readonly genAI: GoogleGenerativeAI;

  constructor(
    apiKey: string,
    private readonly analysisModel: string,
    private readonly generationModel: string,
    private readonly temperature: number,
    private readonly maxOutputTokens: number,
  ) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  // ── Analysis ────────────────────────────────────────────────────────────────

  /**
   * Analyze the full corpus and identify skill clusters.
   * Handles multi-chunk corpora by merging results.
   */
  async analyzeCorpus(
    corpus: Corpus,
    maxSkills: number,
    onProgress?: (msg: string) => void,
  ): Promise<GeminiAnalysisResponse> {
    const model = this.genAI.getGenerativeModel({
      model: this.analysisModel,
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        temperature: 0.1, // low temp for structured analysis
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    });

    const chunks = chunkCorpus(corpus);
    logger.debug(`Corpus split into ${chunks.length} chunk(s) for analysis`);

    if (chunks.length === 1) {
      // Single chunk — straightforward
      const prompt = buildAnalysisPrompt({
        channelName: corpus.source.displayName ?? corpus.source.originalUrl,
        videoCount: corpus.videos.length,
        maxSkills,
        chunk: chunks[0],
      });

      onProgress?.('Sending corpus to Gemini for analysis...');
      const response = await withRetry(
        () => model.generateContent(prompt),
        'corpus-analysis',
      );

      return this.parseAnalysisResponse(response.response.text());
    }

    // Multi-chunk: analyze each chunk, then merge
    const allClusters: GeminiAnalysisResponse['skill_clusters'] = [];
    let mergedSummary = '';

    for (const chunk of chunks) {
      onProgress?.(
        `Analyzing chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks}...`,
      );

      const prompt = buildAnalysisPrompt({
        channelName: corpus.source.displayName ?? corpus.source.originalUrl,
        videoCount: corpus.videos.length,
        maxSkills,
        chunk,
      });

      const response = await withRetry(
        () => model.generateContent(prompt),
        `corpus-analysis-chunk-${chunk.chunkIndex}`,
      );

      const parsed = this.parseAnalysisResponse(response.response.text());
      allClusters.push(...parsed.skill_clusters);
      if (!mergedSummary) mergedSummary = parsed.analysis.channel_summary;
    }

    // Deduplicate clusters by slug
    const seen = new Set<string>();
    const deduped = allClusters.filter((c) => {
      if (seen.has(c.slug)) return false;
      seen.add(c.slug);
      return true;
    });

    return {
      analysis: {
        channel_summary: mergedSummary,
        main_domains: deduped.map((c) => c.name),
        suggested_skill_count: deduped.length,
      },
      skill_clusters: deduped.slice(0, maxSkills),
    };
  }

  private parseAnalysisResponse(text: string): GeminiAnalysisResponse {
    // Clean potential JSON wrapping
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
      const parsed = JSON.parse(cleaned) as GeminiAnalysisResponse;

      // Basic validation
      if (!parsed.skill_clusters || !Array.isArray(parsed.skill_clusters)) {
        throw new GeminiError('Analysis response missing skill_clusters array');
      }

      return parsed;
    } catch (err) {
      logger.debug(`Failed to parse analysis response: ${text.slice(0, 500)}`);
      throw new GeminiError(
        `Failed to parse Gemini analysis response: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Generation ───────────────────────────────────────────────────────────────

  /**
   * Generate a SKILL.md for a single cluster.
   * Returns the full file content ready to write to disk.
   */
  async generateSkill(
    corpus: Corpus,
    cluster: SkillCluster,
    onProgress?: (msg: string) => void,
  ): Promise<{ content: string; name: string; description: string }> {
    const model = this.genAI.getGenerativeModel({
      model: this.generationModel,
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        temperature: this.temperature,
        maxOutputTokens: this.maxOutputTokens,
      },
    });

    // Filter corpus to videos relevant to this cluster
    const clusterVideos = filterCorpusForCluster(corpus, cluster.videoIds);
    const transcriptContent = renderChunkForPrompt({
      videos: clusterVideos,
      totalTokens: clusterVideos.reduce((a, v) => a + v.estimatedTokens, 0),
      chunkIndex: 0,
      totalChunks: 1,
    });

    onProgress?.(`Generating skill "${cluster.name}"...`);

    const prompt = buildGenerationPrompt({
      channelName: corpus.source.displayName ?? corpus.source.originalUrl,
      cluster,
      transcriptContent,
      videoCount: clusterVideos.length,
    });

    const response = await withRetry(
      () => model.generateContent(prompt),
      `skill-generation-${cluster.slug}`,
    );

    const rawContent = response.response.text();
    const content = extractSkillContent(rawContent);
    const { name, description } = parseFrontmatter(content);

    return {
      content,
      name: name ?? cluster.slug,
      description: description ?? cluster.description,
    };
  }
}

/** Factory — create a GeminiService from env config */
export function createGeminiService(config: {
  apiKey: string;
  analysisModel: string;
  generationModel: string;
  temperature: number;
  maxOutputTokens: number;
}): GeminiService {
  return new GeminiService(
    config.apiKey,
    config.analysisModel,
    config.generationModel,
    config.temperature,
    config.maxOutputTokens,
  );
}
