import chalk from 'chalk';
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { loadEnv } from '../../config/env.ts';
import { runPipeline } from '../../pipeline/index.ts';
import {
  printBanner,
  printSummary,
  printError,
  sectionHeader,
  ok,
  info,
  progressBar,
} from '../ui/display.ts';
import { setLogLevel } from '../../logging/logger.ts';
import { Spinner } from '../ui/spinner.ts';
import { installSkills } from '../utils/install.ts';
import type { SkillManifest } from '../../domain/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// update command — re-fetch source and incorporate new videos into skill set
// ─────────────────────────────────────────────────────────────────────────────

export interface UpdateCommandOptions {
  maxVideos?: string;
  maxSkills?: string;
  analysisModel?: string;
  generationModel?: string;
  provider?: 'gemini' | 'claude';
  outputLang?: string;
  install?: boolean;
  verbose?: boolean;
}

export async function runUpdateCommand(
  outputDir: string,
  opts: UpdateCommandOptions,
): Promise<void> {
  let cfg;
  try {
    cfg = loadEnv();
  } catch (err: unknown) {
    printError(
      'Configuration error',
      err instanceof Error ? err.message : String(err),
      'Copy .env.example to .env and fill in your API keys.',
    );
    process.exit(1);
  }

  if (opts.verbose) setLogLevel('debug');
  else setLogLevel('warn');

  await printBanner();

  // ── Read manifest ─────────────────────────────────────────────────────────
  const absOutputDir = resolve(outputDir);
  const manifestPath = join(absOutputDir, 'manifest.json');

  let manifest: SkillManifest;
  try {
    const raw = await readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(raw) as SkillManifest;
  } catch {
    printError(
      'Cannot read manifest',
      `No manifest.json found in "${absOutputDir}"`,
      'Pass the path to a previous ysgen output directory.',
    );
    process.exit(1);
  }

  const source = manifest.source;
  const sourceLabel = source.displayName ?? source.originalUrl;

  // The pipeline appends a dated subdirectory to outputDir, so we need
  // to pass the parent of the existing run dir, not the run dir itself.
  const parentOutputDir = dirname(absOutputDir);

  console.log(sectionHeader('Updating skill set'));
  console.log(info(`Source: ${sourceLabel}`));
  console.log(info(`Output: ${parentOutputDir}`));
  console.log(info(`Previous: ${manifest.skills.length} skill(s), ${manifest.videosWithTranscripts} video(s)`));
  console.log('');

  // ── Re-run pipeline with same source ─────────────────────────────────────
  // Cache is enabled: previously fetched videos load instantly from disk.
  // New videos (not yet cached) get fetched fresh. After transcript assembly,
  // all videos (old + new) are analyzed and skills are regenerated.

  const spinner = new Spinner();
  let lastPhase = '';

  const phaseLabels: Record<string, string> = {
    resolving: 'Resolving source',
    listing: 'Listing videos',
    extracting: 'Fetching transcripts',
    normalizing: 'Normalizing content',
    analyzing: 'Analyzing corpus',
    generating: 'Generating skills',
    writing: 'Writing output',
  };

  let result;
  try {
    result = await runPipeline(
      {
        source,
        outputDir: parentOutputDir,
        maxVideos: opts.maxVideos ? parseInt(opts.maxVideos) : cfg.MAX_VIDEOS,
        maxSkills: opts.maxSkills ? parseInt(opts.maxSkills) : cfg.MAX_SKILLS,
        skipNoTranscript: cfg.SKIP_NO_TRANSCRIPT,
        useCache: true,
        transcriptLang: cfg.TRANSCRIPT_LANG,
        geminiAnalysisModel: opts.analysisModel,
        geminiGenerationModel: opts.generationModel,
        provider: opts.provider,
        outputLang: opts.outputLang,
      },
      (progress) => {
        const label = phaseLabels[progress.phase] ?? progress.phase;

        if (progress.phase !== lastPhase) {
          if (lastPhase) spinner.stop(ok(phaseLabels[lastPhase] ?? lastPhase));
          spinner.start(label);
          lastPhase = progress.phase;
        }

        if (progress.current !== undefined && progress.total !== undefined && progress.total > 1) {
          spinner.message(
            progressBar(progress.current, progress.total) +
            (progress.message ? `  ${chalk.dim(progress.message)}` : ''),
          );
        } else if (progress.message) {
          spinner.message(chalk.dim(progress.message));
        }
      },
    );

    if (lastPhase) {
      spinner.stop(result.success ? ok(phaseLabels[lastPhase] ?? lastPhase) : `✖ ${phaseLabels[lastPhase]}`);
    }
  } catch (err: unknown) {
    if (lastPhase) spinner.stop('✖ Failed');
    const msg = err instanceof Error ? err.message : String(err);
    printError('Pipeline error', msg);
    process.exit(1);
  }

  // ── Display summary ────────────────────────────────────────────────────────
  printSummary(result);

  if (!result.success) {
    process.exit(1);
  }

  // ── Install hint ───────────────────────────────────────────────────────────
  if (result.outputDir && opts.install) {
    await installSkills(result.outputDir);
  }
}
