import chalk from 'chalk';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadEnv } from '../../config/env.ts';
import { getCache } from '../../storage/cache.ts';
import { buildCorpus } from '../../chunkers/corpus.ts';
import { generateSkillsFromCorpus } from '../../skill-generator/generator.ts';
import { writeSkills } from '../../skill-generator/writer.ts';
import { validateSkillContent } from '../../skill-generator/validator.ts';
import {
  printBanner,
  printSummary,
  printError,
  sectionHeader,
  ok,
  warn,
  info,
} from '../ui/display.ts';
import type { PipelineResult, SkillManifest } from '../../domain/index.ts';
import { setLogLevel } from '../../logging/logger.ts';
import { Spinner } from '../ui/spinner.ts';
import { installSkills, buildInstallCommand } from '../utils/install.ts';

// ─────────────────────────────────────────────────────────────────────────────
// regenerate command — re-run LLM phases using cached transcripts
// ─────────────────────────────────────────────────────────────────────────────

export interface RegenerateCommandOptions {
  maxSkills?: string;
  analysisModel?: string;
  generationModel?: string;
  provider?: 'gemini' | 'claude';
  outputLang?: string;
  install?: boolean;
  verbose?: boolean;
}

export async function runRegenerateCommand(
  outputDir: string,
  opts: RegenerateCommandOptions,
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

  const startMs = Date.now();
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

  const videoIds = manifest.videoIds;
  if (!videoIds || videoIds.length === 0) {
    printError(
      'No video IDs in manifest',
      'This output was created with an older version of ysgen that did not store video IDs.',
      'Re-run the original generate command to produce a new manifest with video IDs.',
    );
    process.exit(1);
  }

  console.log(sectionHeader('Regenerating from cache'));
  console.log(info(`Source: ${manifest.source.displayName ?? manifest.source.originalUrl}`));
  console.log(info(`${videoIds.length} video(s) in manifest`));
  console.log('');

  // ── Load cached transcripts ───────────────────────────────────────────────
  const spinner = new Spinner();
  spinner.start('Loading cached transcripts');

  const cache = getCache(cfg.CACHE_DIR, cfg.CACHE_TTL_HOURS);
  await cache.init();

  const loadedVideos = [];
  const missing: string[] = [];

  for (const id of videoIds) {
    const video = await cache.getVideo(id);
    if (video) {
      loadedVideos.push(video);
    } else {
      missing.push(id);
    }
  }

  spinner.stop(ok(`Loaded ${loadedVideos.length}/${videoIds.length} from cache`));

  if (missing.length > 0) {
    console.log(warn(`${missing.length} video(s) not in cache (skipped): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`));
  }

  if (loadedVideos.length === 0) {
    printError(
      'No cached transcripts found',
      'All videos from the manifest have expired or missing cache entries.',
      `Re-run: ysgen fetch --channel "${manifest.source.originalUrl}" then ysgen generate`,
    );
    process.exit(1);
  }

  // Filter to videos with non-empty transcripts
  const validVideos = loadedVideos.filter((v) => v.transcript && v.transcript.length > 200);
  if (validVideos.length < loadedVideos.length) {
    console.log(warn(`${loadedVideos.length - validVideos.length} video(s) had insufficient transcript content`));
  }

  // ── Build corpus ───────────────────────────────────────────────────────────
  spinner.start('Building corpus');
  const corpus = buildCorpus(validVideos, manifest.source);
  spinner.stop(ok(`Corpus: ${corpus.videos.length} videos, ~${Math.round(corpus.totalTokens / 1000)}K tokens`));

  // ── Run analysis + generation ──────────────────────────────────────────────
  console.log('');
  const maxSkills = opts.maxSkills ? parseInt(opts.maxSkills) : cfg.MAX_SKILLS;

  let lastPhase = '';
  const phaseLabels: Record<string, string> = {
    analyzing: 'Analyzing corpus',
    generating: 'Generating skills',
    writing: 'Writing output',
  };

  let skills;
  let genResult: Awaited<ReturnType<typeof generateSkillsFromCorpus>> | null = null;
  try {
    spinner.start('Analyzing corpus');
    lastPhase = 'analyzing';

    const result = await generateSkillsFromCorpus(
      corpus,
      {
        geminiApiKey: cfg.GEMINI_API_KEY,
        analysisModel: opts.analysisModel ?? cfg.GEMINI_ANALYSIS_MODEL,
        generationModel: opts.generationModel ?? cfg.GEMINI_GENERATION_MODEL,
        temperature: cfg.GEMINI_TEMPERATURE,
        maxOutputTokens: cfg.GEMINI_MAX_OUTPUT_TOKENS,
        maxSkills,
        provider: opts.provider,
        claudeApiKey: process.env.ANTHROPIC_API_KEY,
        outputLang: opts.outputLang,
      },
      (phase, detail) => {
        const label = phaseLabels[phase] ?? phase;
        if (phase !== lastPhase) {
          spinner.stop(ok(phaseLabels[lastPhase] ?? lastPhase));
          spinner.start(label);
          lastPhase = phase;
        }
        if (detail) spinner.message(chalk.dim(detail));
      },
    );

    skills = result.skills;
    genResult = result;
    if (lastPhase) spinner.stop(ok(phaseLabels[lastPhase] ?? lastPhase));
  } catch (err: unknown) {
    spinner.stop('✖ Failed');
    printError('Generation error', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (skills.length === 0) {
    printError('No skills generated', 'Gemini returned no valid skills.');
    process.exit(1);
  }

  // ── Validate skills ────────────────────────────────────────────────────────
  console.log('');
  for (const skill of skills) {
    const v = validateSkillContent(skill.content, skill.skillName);
    const scoreColor = v.score >= 80 ? chalk.green : v.score >= 60 ? chalk.yellow : chalk.red;
    console.log(info(`${skill.skillName}  ${scoreColor(`score: ${v.score}/100`)}`));
    if (v.missingSections.length > 0) {
      console.log(warn(`  Missing: ${v.missingSections.join(', ')}`));
    }
  }
  console.log('');

  // ── Write output (overwrite same dir) ─────────────────────────────────────
  spinner.start('Writing output');
  const { skillPaths } = await writeSkills(skills, absOutputDir, manifest.source, {
    videosProcessed: validVideos.length,
    videosWithTranscripts: validVideos.length,
    videoIds: validVideos.map((v) => v.id),
  });
  spinner.stop(ok(`${skillPaths.length} skill(s) written`));

  // ── Summary (boxed, with token/cost) ─────────────────────────────────────
  const elapsed = Date.now() - startMs;
  const fakeResult: PipelineResult = {
    success: true,
    videosProcessed: validVideos.length,
    videosWithTranscripts: validVideos.length,
    videosSkipped: 0,
    skillsGenerated: skills.length,
    skills,
    outputPaths: skillPaths,
    outputDir: absOutputDir,
    durationMs: elapsed,
    errors: [],
    totalUsage: genResult?.totalUsage,
    providerName: genResult?.providerName,
    analysisModel: genResult?.analysisModel,
    generationModel: genResult?.generationModel,
  };
  printSummary(fakeResult);

  if (opts.install) {
    await installSkills(absOutputDir);
  } else {
    const cmd = buildInstallCommand(absOutputDir);
    console.log(chalk.dim(`  Tip: install with: ${chalk.white(cmd)}`));
    console.log('');
  }
}
