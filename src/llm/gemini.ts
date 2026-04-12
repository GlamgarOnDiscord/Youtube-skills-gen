import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type {
  GeminiAnalysisResponse,
  SkillCluster,
  Corpus,
} from '../domain/index.ts';
import { GeminiError } from '../domain/index.ts';
import {
  buildMetadataAnalysisPrompt,
  buildGenerationPrompt,
  extractSkillContent,
  parseFrontmatter,
} from './prompts.ts';
import {
  filterCorpusForCluster,
  renderChunkForPrompt,
} from '../chunkers/corpus.ts';
import logger from '../logging/logger.ts';
import { MAX_RETRIES, RETRY_DELAY_BASE_MS } from '../config/defaults.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Gemini client — analysis (metadata-only) + generation (full transcripts)
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
   * Analyze the corpus and identify skill clusters.
   *
   * Strategy: metadata-only pass — send video title + 300-char transcript
   * snippet for ALL videos in one request. This keeps input under ~100K tokens
   * regardless of channel size, while giving Gemini enough signal to cluster.
   *
   * Full transcripts are only sent during the generation pass (per cluster).
   */
  async analyzeCorpus(
    corpus: Corpus,
    maxSkills: number,
    onProgress?: (msg: string) => void,
  ): Promise<GeminiAnalysisResponse> {
    // Increased output tokens — 8192 comfortably fits a cluster assignment
    // JSON for 500+ videos across up to 6 clusters.
    const model = this.genAI.getGenerativeModel({
      model: this.analysisModel,
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });

    const prompt = buildMetadataAnalysisPrompt({
      channelName: corpus.source.displayName ?? corpus.source.originalUrl,
      videos: corpus.videos,
      maxSkills,
    });

    const estimatedInputTokens = Math.round(prompt.length / 4);
    logger.debug(
      `Analysis prompt: ${corpus.videos.length} videos, ~${estimatedInputTokens.toLocaleString()} tokens`,
    );

    onProgress?.(`Sending ${corpus.videos.length} video metadata to Gemini...`);

    const response = await withRetry(
      () => model.generateContent(prompt),
      'corpus-analysis',
    );

    return this.parseAnalysisResponse(response.response.text());
  }

  private parseAnalysisResponse(text: string): GeminiAnalysisResponse {
    // Strip markdown code fences if present
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as GeminiAnalysisResponse;

      if (!parsed.skill_clusters || !Array.isArray(parsed.skill_clusters)) {
        throw new GeminiError('Analysis response missing skill_clusters array');
      }

      // Ensure every cluster has the expected shape
      for (const c of parsed.skill_clusters) {
        if (!c.id) c.id = c.slug ?? 'unknown';
        if (!Array.isArray(c.video_ids)) c.video_ids = [];
        if (!Array.isArray(c.key_concepts)) c.key_concepts = [];
        if (!c.estimated_depth) c.estimated_depth = 'medium';
      }

      return parsed;
    } catch (err) {
      logger.debug(`Raw Gemini response (first 800 chars):\n${text.slice(0, 800)}`);
      throw new GeminiError(
        `Failed to parse Gemini analysis response: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Generation ───────────────────────────────────────────────────────────────

  /**
   * Generate a SKILL.md for a single cluster.
   * Sends the full transcripts of the cluster's videos.
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
