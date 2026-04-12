import type {
  Corpus,
  GeneratedSkill,
  GeminiAnalysisResponse,
  SkillCluster,
} from '../domain/index.ts';
import { createGeminiService } from '../llm/gemini.ts';
import logger from '../logging/logger.ts';
import { estimateTokens } from '../normalizers/text.ts';

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
}

export interface GenerationResult {
  skills: GeneratedSkill[];
  analysis: GeminiAnalysisResponse['analysis'];
  clusters: SkillCluster[];
}

export async function generateSkillsFromCorpus(
  corpus: Corpus,
  config: GeneratorConfig,
  onProgress?: (phase: string, detail?: string) => void,
): Promise<GenerationResult> {
  const gemini = createGeminiService({
    apiKey: config.geminiApiKey,
    analysisModel: config.analysisModel,
    generationModel: config.generationModel,
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
  });

  // ── Step 1: Analyze corpus and identify skill clusters ─────────────────────
  onProgress?.('analyzing', 'Identifying skill domains...');
  logger.info(`Analyzing corpus of ${corpus.videos.length} videos...`);

  const analysisResponse = await gemini.analyzeCorpus(
    corpus,
    config.maxSkills,
    (msg) => onProgress?.('analyzing', msg),
  );

  const { analysis, skill_clusters: rawClusters } = analysisResponse;
  logger.info(
    `Analysis complete: ${rawClusters.length} skill domain(s) identified`,
    { summary: analysis.channel_summary },
  );

  // Map raw cluster data to domain type
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

  // ── Step 2: Generate each skill ────────────────────────────────────────────
  const skills: GeneratedSkill[] = [];

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    onProgress?.('generating', `[${i + 1}/${clusters.length}] ${cluster.name}`);
    logger.info(`Generating skill: "${cluster.name}" (${cluster.videoIds.length} videos)`);

    try {
      const { content, name, description } = await gemini.generateSkill(
        corpus,
        cluster,
        (msg) => onProgress?.('generating', msg),
      );

      const skill: GeneratedSkill = {
        cluster,
        content,
        skillName: name,
        skillDescription: description,
        sourceVideoIds: cluster.videoIds,
        tokenCount: estimateTokens(content),
      };

      skills.push(skill);
      logger.debug(`Skill "${name}" generated (${estimateTokens(content)} tokens)`);
    } catch (err) {
      logger.error(`Failed to generate skill "${cluster.name}": ${err instanceof Error ? err.message : String(err)}`);
      // Continue with remaining skills
    }
  }

  return { skills, analysis, clusters };
}
