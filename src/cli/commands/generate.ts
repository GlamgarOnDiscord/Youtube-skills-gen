import * as p from '@clack/prompts';
import chalk from 'chalk';
import { loadEnv } from '../../config/env.ts';
import { resolveSource, validateUrl } from '../../providers/youtube/resolver.ts';
import { runPipeline } from '../../pipeline/index.ts';
import { runInteractiveWizard } from '../ui/prompts.ts';
import {
  printBanner,
  printSummary,
  printError,
  sectionHeader,
  ok,
  warn,
  progressBar,
} from '../ui/display.ts';
import { setLogLevel } from '../../logging/logger.ts';
import type { PipelineOptions, YouTubeSource } from '../../domain/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// generate command — main entry point for skill generation
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateCommandOptions {
  channel?: string;
  playlist?: string;
  video?: string[];
  interactive?: boolean;
  output?: string;
  maxVideos?: string;
  maxSkills?: string;
  noCache?: boolean;
  skipNoTranscript?: boolean;
  dryRun?: boolean;
  lang?: string;
  analysisModel?: string;
  generationModel?: string;
  verbose?: boolean;
}

export async function runGenerateCommand(opts: GenerateCommandOptions): Promise<void> {
  // Load environment first
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

  printBanner();

  let pipelineOptions: PipelineOptions;

  if (opts.interactive || (!opts.channel && !opts.playlist && !opts.video)) {
    // ── Interactive wizard mode ──────────────────────────────────────────────
    const wizard = await runInteractiveWizard(opts.output ?? cfg.OUTPUT_DIR);

    pipelineOptions = {
      source: wizard.sources,
      outputDir: wizard.outputDir,
      maxVideos: wizard.maxVideos,
      maxSkills: wizard.maxSkills,
      skipNoTranscript: wizard.skipNoTranscript,
      useCache: !opts.noCache,
      dryRun: opts.dryRun,
      transcriptLang: opts.lang,
      geminiAnalysisModel: opts.analysisModel,
      geminiGenerationModel: opts.generationModel,
    };
  } else {
    // ── Flag-driven mode ─────────────────────────────────────────────────────
    const sources: YouTubeSource[] = [];

    if (opts.channel) {
      const v = validateUrl(opts.channel);
      if (!v.valid) {
        printError('Invalid URL', v.reason ?? 'Bad channel URL');
        process.exit(1);
      }
      sources.push(resolveSource(opts.channel));
    }

    if (opts.playlist) {
      const v = validateUrl(opts.playlist);
      if (!v.valid) {
        printError('Invalid URL', v.reason ?? 'Bad playlist URL');
        process.exit(1);
      }
      sources.push(resolveSource(opts.playlist));
    }

    if (opts.video && opts.video.length > 0) {
      for (const url of opts.video) {
        const v = validateUrl(url);
        if (!v.valid) {
          console.log(warn(`Skipping invalid URL: ${url}`));
          continue;
        }
        sources.push(resolveSource(url));
      }
    }

    if (sources.length === 0) {
      printError(
        'No input provided',
        'Provide at least one of --channel, --playlist, or --video',
        'Or run without flags to use the interactive wizard.',
      );
      process.exit(1);
    }

    pipelineOptions = {
      source: sources,
      outputDir: opts.output ?? cfg.OUTPUT_DIR,
      maxVideos: opts.maxVideos ? parseInt(opts.maxVideos) : cfg.MAX_VIDEOS,
      maxSkills: opts.maxSkills ? parseInt(opts.maxSkills) : cfg.MAX_SKILLS,
      skipNoTranscript: opts.skipNoTranscript ?? cfg.SKIP_NO_TRANSCRIPT,
      useCache: !opts.noCache,
      dryRun: opts.dryRun,
      transcriptLang: opts.lang ?? cfg.TRANSCRIPT_LANG,
      geminiAnalysisModel: opts.analysisModel,
      geminiGenerationModel: opts.generationModel,
    };
  }

  // ── Run pipeline with live progress ─────────────────────────────────────────
  console.log(sectionHeader('Starting pipeline'));
  console.log('');

  const spinner = p.spinner();
  let lastPhase = '';

  const phaseLabels: Record<string, string> = {
    resolving: 'Resolving sources',
    listing: 'Listing videos',
    extracting: 'Fetching transcripts',
    normalizing: 'Normalizing content',
    analyzing: 'Analyzing corpus',
    generating: 'Generating skills',
    writing: 'Writing output',
  };

  let result;
  let skills: import('../../domain/index.ts').GeneratedSkill[] | undefined;

  try {
    result = await runPipeline(pipelineOptions, (progress) => {
      const label = phaseLabels[progress.phase] ?? progress.phase;

      if (progress.phase !== lastPhase) {
        if (lastPhase) spinner.stop(ok(phaseLabels[lastPhase] ?? lastPhase));
        spinner.start(chalk.dim(label + '...'));
        lastPhase = progress.phase;
      }

      if (progress.current !== undefined && progress.total !== undefined) {
        spinner.message(
          `${label}: ${progressBar(progress.current, progress.total)}` +
          (progress.message ? `  ${chalk.dim(progress.message)}` : ''),
        );
      } else if (progress.message) {
        spinner.message(`${label}: ${chalk.dim(progress.message)}`);
      }
    });

    if (lastPhase) {
      spinner.stop(result.success ? ok(phaseLabels[lastPhase] ?? lastPhase) : `✖ ${phaseLabels[lastPhase]}`);
    }
  } catch (err: unknown) {
    if (lastPhase) spinner.stop(`✖ Failed`);
    const msg = err instanceof Error ? err.message : String(err);
    printError('Pipeline error', msg);
    process.exit(1);
  }

  // ── Display summary ──────────────────────────────────────────────────────────
  printSummary(result, skills);

  if (!result.success) {
    process.exit(1);
  }

  // Hint: copy to Claude skills directory
  if (result.outputPaths.length > 0) {
    const outputDir = result.outputPaths[0].split('/').slice(0, -2).join('/');
    console.log(
      chalk.dim(
        `  Tip: copy to ~/.claude/skills/ to use with Claude Code:\n` +
        `  ${chalk.white(`cp -r ${outputDir}/* ~/.claude/skills/`)}`,
      ),
    );
    console.log('');
  }
}
