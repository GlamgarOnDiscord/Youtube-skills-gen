#!/usr/bin/env bun
import 'dotenv/config';
import { Command } from 'commander';
import { runGenerateCommand } from './commands/generate.ts';
import { runFetchCommand } from './commands/fetch.ts';
import { runInspectCommand } from './commands/inspect.ts';
import { runRegenerateCommand } from './commands/regenerate.ts';
import { runListCommand } from './commands/list.ts';
import { runUpdateCommand } from './commands/update.ts';

// ─────────────────────────────────────────────────────────────────────────────
// ysgen — YouTube Skills Generator CLI
// ─────────────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('ysgen')
  .description(
    'Transform YouTube channel/playlist/video content into Claude Code Skills using Gemini AI',
  )
  .version('0.1.0');

// ── generate ────────────────────────────────────────────────────────────────────

program
  .command('generate')
  .alias('gen')
  .description('Generate Claude Code Skills from YouTube content')
  .option('-c, --channel <url>', 'YouTube channel URL (e.g. https://www.youtube.com/@name)')
  .option('-p, --playlist <url>', 'YouTube playlist URL')
  .option('-v, --video <url...>', 'One or more video URLs')
  .option('-i, --interactive', 'Launch interactive wizard')
  .option('-o, --output <dir>', 'Output directory for generated skills')
  .option('--max-videos <n>', 'Maximum number of videos to process (0 = all)')
  .option('--max-skills <n>', 'Maximum number of skills to generate (default: 5)')
  .option('--lang <code>', 'Preferred transcript language (default: en)')
  .option('--no-cache', 'Disable transcript cache (always re-fetch)')
  .option('--skip-no-transcript', 'Skip videos without transcripts (default: true)')
  .option('--dry-run', 'Fetch and prepare corpus only, skip LLM generation')
  .option('--analysis-model <model>', 'LLM model for analysis phase')
  .option('--generation-model <model>', 'LLM model for generation phase')
  .option('--provider <name>', 'LLM provider: gemini (default) or claude')
  .option('--output-lang <lang>', 'Language for generated skill content (e.g. fr, de, ja)')
  .option('--min-views <n>', 'Skip videos with fewer than N views')
  .option('--since <date>', 'Only include videos published after this date (e.g. 2024-01-01)')
  .option('--max-age-days <n>', 'Only include videos published within the last N days')
  .option('--exclude-shorts', 'Skip YouTube Shorts (videos under 60 seconds)')
  .option('--install', 'Auto-install generated skills to ~/.claude/skills/')
  .option('--verbose', 'Enable verbose debug logging')
  .action(runGenerateCommand);

// ── fetch ────────────────────────────────────────────────────────────────────────

program
  .command('fetch')
  .description('Pre-fetch and cache transcripts without generating skills')
  .option('-c, --channel <url>', 'YouTube channel URL')
  .option('-p, --playlist <url>', 'YouTube playlist URL')
  .option('-v, --video <url...>', 'One or more video URLs')
  .option('--max-videos <n>', 'Maximum number of videos to fetch')
  .option('--lang <code>', 'Preferred transcript language')
  .option('--no-cache', 'Do not write to cache (dry fetch)')
  .action(runFetchCommand);

// ── regenerate ──────────────────────────────────────────────────────────────────

program
  .command('regenerate')
  .alias('regen')
  .description('Re-generate skills from a previous run (skips transcript fetching)')
  .argument('<outputDir>', 'Path to a previous ysgen output directory (containing manifest.json)')
  .option('--max-skills <n>', 'Override number of skills to generate')
  .option('--analysis-model <model>', 'LLM model for analysis phase')
  .option('--generation-model <model>', 'LLM model for generation phase')
  .option('--provider <name>', 'LLM provider: gemini (default) or claude')
  .option('--output-lang <lang>', 'Language for generated skill content (e.g. fr, de, ja)')
  .option('--install', 'Auto-install regenerated skills to ~/.claude/skills/')
  .option('--verbose', 'Enable verbose debug logging')
  .action(runRegenerateCommand);

// ── list ─────────────────────────────────────────────────────────────────────────

program
  .command('list')
  .alias('ls')
  .description('List all previously generated skill sets')
  .option('-o, --output <dir>', 'Root output directory to scan (default: ./output)')
  .action(runListCommand);

// ── update ────────────────────────────────────────────────────────────────────────

program
  .command('update')
  .description('Incrementally update a skill set with new videos from the source')
  .argument('<outputDir>', 'Path to a previous ysgen output directory (containing manifest.json)')
  .option('--max-videos <n>', 'Maximum total videos to process (0 = all)')
  .option('--max-skills <n>', 'Override number of skills to generate')
  .option('--provider <name>', 'LLM provider: gemini (default) or claude')
  .option('--output-lang <lang>', 'Language for generated skill content')
  .option('--install', 'Auto-install updated skills to ~/.claude/skills/')
  .option('--verbose', 'Enable verbose debug logging')
  .action(runUpdateCommand);

// ── inspect ──────────────────────────────────────────────────────────────────────

program
  .command('inspect')
  .description('Inspect and manage the transcript cache')
  .option('-l, --list', 'List all cached video IDs')
  .option('-s, --stats', 'Show cache statistics (default)')
  .option('--clear', 'Clear all cached entries')
  .option('--clear-expired', 'Remove only expired cache entries')
  .action(runInspectCommand);

// ── Default action: launch interactive wizard when no subcommand is given ────

program.action(() => {
  runGenerateCommand({ interactive: true });
});

// ── Default: show help ────────────────────────────────────────────────────────

program.addHelpText(
  'afterAll',
  `
Examples:
  ysgen generate --channel https://www.youtube.com/@fireship
  ysgen generate --channel https://www.youtube.com/@fireship --provider claude --output-lang fr
  ysgen generate --playlist https://www.youtube.com/playlist?list=PLxxx
  ysgen generate --video https://youtu.be/abc123 --video https://youtu.be/def456
  ysgen generate --interactive
  ysgen generate --channel https://www.youtube.com/@channel --max-videos 50 --max-skills 3
  ysgen generate --channel https://www.youtube.com/@channel --exclude-shorts --min-views 10000
  ysgen list
  ysgen update ./output/fireship
  ysgen fetch --channel https://www.youtube.com/@channel
  ysgen inspect --list
  ysgen inspect --clear-expired

Environment:
  GEMINI_API_KEY      Required — Gemini API key (aistudio.google.com)
  ANTHROPIC_API_KEY   Required when using --provider claude
  YOUTUBE_API_KEY     Required for channels/playlists
  OUTPUT_DIR          Default output directory (default: ./output)

Docs: https://github.com/glamgarondiscord/youtube-skills-gen
`,
);

// Parse and run
program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
