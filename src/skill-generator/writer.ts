import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  GeneratedSkill,
  SkillManifest,
  YouTubeSource,
} from '../domain/index.ts';
import logger from '../logging/logger.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Skill writer — writes generated skills to disk in proper directory structure
// ─────────────────────────────────────────────────────────────────────────────

export interface WriteResult {
  /** Absolute path to the root output folder */
  outputDir: string;
  /** Paths to each generated SKILL.md */
  skillPaths: string[];
  /** Path to the manifest JSON */
  manifestPath: string;
}

/**
 * Write all generated skills to disk.
 *
 * Output structure:
 * ```
 * <outputDir>/
 *   <slug>/
 *     SKILL.md
 *   manifest.json
 * ```
 */
export async function writeSkills(
  skills: GeneratedSkill[],
  outputDir: string,
  source: YouTubeSource,
  meta: {
    videosProcessed: number;
    videosWithTranscripts: number;
    videoIds?: string[];
  },
): Promise<WriteResult> {
  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  const skillPaths: string[] = [];

  for (const skill of skills) {
    const skillDir = join(outputDir, skill.skillName);
    await mkdir(skillDir, { recursive: true });

    const skillPath = join(skillDir, 'SKILL.md');
    await writeFile(skillPath, skill.content, 'utf-8');
    skillPaths.push(skillPath);

    logger.debug(`Wrote ${skillPath}`);

    // Write supporting files if any
    if (skill.supportingFiles) {
      for (const { filename, content } of skill.supportingFiles) {
        const filePath = join(skillDir, filename);
        await writeFile(filePath, content, 'utf-8');
        logger.debug(`Wrote supporting file: ${filePath}`);
      }
    }
  }

  // Write manifest
  const manifest: SkillManifest = {
    generatedAt: new Date().toISOString(),
    source,
    videosProcessed: meta.videosProcessed,
    videosWithTranscripts: meta.videosWithTranscripts,
    ...(meta.videoIds ? { videoIds: meta.videoIds } : {}),
    skills: skills.map((s) => ({
      name: s.skillName,
      slug: s.cluster.slug,
      path: join(s.skillName, 'SKILL.md'),
      videoCount: s.sourceVideoIds.length,
      description: s.skillDescription,
    })),
  };

  const manifestPath = join(outputDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  logger.debug(`Wrote manifest: ${manifestPath}`);

  return { outputDir, skillPaths, manifestPath };
}

/**
 * Generate a safe output directory name from source metadata.
 * Format: <slug>-skills-<date>
 */
export function buildOutputDirName(source: YouTubeSource): string {
  // Prefer displayName; for bare video URLs extract the video ID (v=xxxxx)
  let name = source.displayName;
  if (!name) {
    const videoIdMatch = source.originalUrl.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    const atMatch      = source.originalUrl.match(/@([\w.-]+)/);
    name = videoIdMatch?.[1] ?? atMatch?.[1] ?? source.originalUrl;
  }

  const slug = name
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  const date = new Date().toISOString().split('T')[0];
  return `${slug || 'youtube'}-skills-${date}`;
}
