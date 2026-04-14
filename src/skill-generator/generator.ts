import type {
  Corpus,
  GeneratedSkill,
  GeminiAnalysisResponse,
  SkillCluster,
} from '../domain/index.ts';
import type { LLMProvider, TokenUsage } from '../llm/provider.ts';
import { createGeminiService } from '../llm/gemini.ts';
import { createClaudeService } from '../llm/claude.ts';
import logger from '../logging/logger.ts';
import { estimateTokens } from '../normalizers/text.ts';
import { validateSkillContent } from './validator.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Skill generator — orchestrates analysis → cluster → generation
// ─────────────────────────────────────────────────────────────────────────────

export interface GeneratorConfig {
  geminiApiKey: string;
  analysisModel: string;
  generationModel: string;
  temperature: number;
  maxOutputTokens: number;
  maxSkills: number;
  /** Fallback model used if primary generation fails (Gemini only) */
  fallbackGenerationModel?: string;
  /** LLM provider — 'gemini' (default) or 'claude' */
  provider?: 'gemini' | 'claude';
  /** Claude API key (if provider is 'claude') */
  claudeApiKey?: string;
  /** Language for generated skill content (e.g. 'fr', 'de') */
  outputLang?: string;
}

export interface GenerationResult {
  skills: GeneratedSkill[];
  analysis: GeminiAnalysisResponse['analysis'];
  clusters: SkillCluster[];
  totalUsage: TokenUsage;
  providerName: string;
  analysisModel: string;
  generationModel: string;
}

export async function generateSkillsFromCorpus(
  corpus: Corpus,
  config: GeneratorConfig,
  onProgress?: (phase: string, detail?: string) => void,
): Promise<GenerationResult> {
  // ── Instantiate provider ───────────────────────────────────────────────────
  let llm: LLMProvider;
  if (config.provider === 'claude') {
    llm = createClaudeService({
      apiKey: config.claudeApiKey,
      analysisModel: config.analysisModel,
      generationModel: config.generationModel,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
    });
  } else {
    llm = createGeminiService({
      apiKey: config.geminiApiKey,
      analysisModel: config.analysisModel,
      generationModel: config.generationModel,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      fallbackGenerationModel: config.fallbackGenerationModel,
    });
  }

  const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  // ── Step 1: Analyze corpus and identify skill clusters ─────────────────────
  onProgress?.('analyzing', 'Identifying skill domains...');
  logger.info(`Analyzing corpus of ${corpus.videos.length} videos with ${llm.providerName}...`);

  const { result: analysisResponse, usage: analysisUsage } = await llm.analyzeCorpus(
    corpus,
    config.maxSkills,
    (msg) => onProgress?.('analyzing', msg),
  );

  totalUsage.inputTokens  += analysisUsage.inputTokens;
  totalUsage.outputTokens += analysisUsage.outputTokens;

  const { analysis, skill_clusters: rawClusters } = analysisResponse;
  logger.info(
    `Analysis complete: ${rawClusters.length} skill domain(s) identified`,
    { summary: analysis.channel_summary },
  );

  const clusters: SkillCluster[] = rawClusters.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    coreCompetency: c.core_competency,
    videoIds: c.video_ids,
    keyConcepts: c.key_concepts,
    estimatedDepth: c.estimated_depth,
  }));

  // ── Step 2: Generate all skills in parallel ────────────────────────────────
  const skills: GeneratedSkill[] = [];

  let completed = 0;
  const results = await Promise.allSettled(
    clusters.map((cluster) => {
      logger.info(`Generating skill: "${cluster.name}" (${cluster.videoIds.length} videos)`);
      return llm.generateSkill(
        corpus,
        cluster,
        (msg) => onProgress?.('generating', msg),
        config.outputLang,
      ).then(
        (res) => {
          completed++;
          onProgress?.('generating', `[${completed}/${clusters.length}] ${cluster.name}`);
          return { cluster, ...res };
        },
        (err) => {
          completed++;
          throw Object.assign(
            err instanceof Error ? err : new Error(String(err)),
            { clusterName: cluster.name },
          );
        },
      );
    }),
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      const reason = result.reason as Error & { clusterName?: string };
      const clusterLabel = reason.clusterName ? ` "${reason.clusterName}"` : '';
      logger.error(`Failed to generate skill${clusterLabel}: ${reason.message}`);
      continue;
    }

    const { cluster, content, name, description, usage } = result.value;
    totalUsage.inputTokens  += usage.inputTokens;
    totalUsage.outputTokens += usage.outputTokens;

    // Validate generated skill (quality check — debug only, not a hard failure)
    const validation = validateSkillContent(content, name);
    if (!validation.valid) {
      logger.debug(
        `Skill "${name}" quality score: ${validation.score}/100 — missing: ${validation.missingSections.join(', ')}`,
      );
    }

    const skill: GeneratedSkill = {
      cluster,
      content,
      skillName: name,
      skillDescription: description,
      sourceVideoIds: cluster.videoIds,
      tokenCount: estimateTokens(content),
    };

    skills.push(skill);
    logger.debug(`Skill "${name}" generated (${estimateTokens(content)} tokens, score: ${validation.score}/100)`);
  }

  return {
    skills,
    analysis,
    clusters,
    totalUsage,
    providerName: llm.providerName,
    analysisModel: llm.analysisModel,
    generationModel: llm.generationModel,
  };
}
