import Anthropic from '@anthropic-ai/sdk';
import type { GeminiAnalysisResponse, SkillCluster, Corpus } from '../domain/index.ts';
import { GeminiError } from '../domain/index.ts';
import type { LLMProvider, LLMProviderConfig, TokenUsage } from './provider.ts';
import {
  buildMetadataAnalysisPrompt,
  buildGenerationPrompt,
  extractSkillContent,
  parseFrontmatter,
} from './prompts.ts';
import { filterCorpusForCluster, renderChunkForPrompt } from '../chunkers/corpus.ts';
import logger from '../logging/logger.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Claude provider — same prompts as Gemini, different API client
// ─────────────────────────────────────────────────────────────────────────────

export class ClaudeService implements LLMProvider {
  readonly providerName = 'claude';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly analysisModel: string,
    readonly generationModel: string,
    private readonly temperature: number,
    private readonly maxOutputTokens: number,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  // ── Analysis ────────────────────────────────────────────────────────────────

  async analyzeCorpus(
    corpus: Corpus,
    maxSkills: number,
    onProgress?: (msg: string) => void,
  ): Promise<{ result: GeminiAnalysisResponse; usage: TokenUsage }> {
    const prompt = buildMetadataAnalysisPrompt({
      channelName: corpus.source.displayName ?? corpus.source.originalUrl,
      videos: corpus.videos,
      maxSkills,
    });

    onProgress?.(`Sending ${corpus.videos.length} video metadata to Claude...`);

    const message = await this.client.messages.create({
      model: this.analysisModel,
      max_tokens: 8192,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const usage: TokenUsage = {
      inputTokens:  message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };

    return { result: this.parseAnalysisResponse(text), usage };
  }

  private parseAnalysisResponse(text: string): GeminiAnalysisResponse {
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as GeminiAnalysisResponse;
      if (!parsed.skill_clusters || !Array.isArray(parsed.skill_clusters)) {
        throw new GeminiError('Analysis response missing skill_clusters array');
      }
      for (const c of parsed.skill_clusters) {
        if (!c.id) c.id = c.slug ?? 'unknown';
        if (!Array.isArray(c.video_ids)) c.video_ids = [];
        if (!Array.isArray(c.key_concepts)) c.key_concepts = [];
        if (!c.estimated_depth) c.estimated_depth = 'medium';
      }
      return parsed;
    } catch (err) {
      logger.debug(`Raw Claude response (first 800 chars):\n${text.slice(0, 800)}`);
      throw new GeminiError(
        `Failed to parse Claude analysis response: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Generation ───────────────────────────────────────────────────────────────

  async generateSkill(
    corpus: Corpus,
    cluster: SkillCluster,
    onProgress?: (msg: string) => void,
    outputLang?: string,
  ): Promise<{ content: string; name: string; description: string; usage: TokenUsage }> {
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
      outputLang,
    });

    const message = await this.client.messages.create({
      model: this.generationModel,
      max_tokens: this.maxOutputTokens,
      temperature: this.temperature,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawContent = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const content = extractSkillContent(rawContent);
    const { name, description } = parseFrontmatter(content);
    const usage: TokenUsage = {
      inputTokens:  message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };

    return {
      content,
      name: name ?? cluster.slug,
      description: description ?? cluster.description,
      usage,
    };
  }
}

/** Factory — create a ClaudeService. API key read from ANTHROPIC_API_KEY if not provided */
export function createClaudeService(config: Omit<LLMProviderConfig, 'apiKey'> & { apiKey?: string }): ClaudeService {
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required when using the Claude provider');
  }
  return new ClaudeService(
    apiKey,
    config.analysisModel,
    config.generationModel,
    config.temperature,
    config.maxOutputTokens,
  );
}
