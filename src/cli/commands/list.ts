import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import chalk from 'chalk';
import { loadEnv } from '../../config/env.ts';
import { printBanner, printError } from '../ui/display.ts';
import type { SkillManifest } from '../../domain/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// list command — inventory of all output runs
// ─────────────────────────────────────────────────────────────────────────────

export interface ListCommandOptions {
  output?: string;
}

interface RunEntry {
  dir: string;
  manifest: SkillManifest;
}

export async function runListCommand(opts: ListCommandOptions): Promise<void> {
  let cfg;
  try {
    cfg = loadEnv();
  } catch {
    // If env fails, use default output dir
    cfg = null;
  }

  const rootDir = resolve(opts.output ?? cfg?.OUTPUT_DIR ?? './output');

  await printBanner();

  // Scan rootDir for subdirectories containing manifest.json
  let entries: RunEntry[] = [];

  try {
    const dirStat = await stat(rootDir);
    if (!dirStat.isDirectory()) {
      printError('Not a directory', `"${rootDir}" is not a valid directory`);
      process.exit(1);
    }
  } catch {
    console.log(chalk.dim(`  No output directory found at "${rootDir}".`));
    console.log(chalk.dim('  Run `ysgen generate` to create your first skill set.\n'));
    return;
  }

  // Check if rootDir itself has a manifest (single run output)
  try {
    const raw = await readFile(join(rootDir, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(raw) as SkillManifest;
    entries.push({ dir: rootDir, manifest });
  } catch {
    // No manifest in root — scan subdirs
    try {
      const subdirs = await readdir(rootDir, { withFileTypes: true });
      for (const entry of subdirs) {
        if (!entry.isDirectory()) continue;
        const sub = join(rootDir, entry.name);
        try {
          const raw = await readFile(join(sub, 'manifest.json'), 'utf-8');
          const manifest = JSON.parse(raw) as SkillManifest;
          entries.push({ dir: sub, manifest });
        } catch {
          // No manifest in this subdir — skip
        }
      }
    } catch {
      // Can't read rootDir
    }
  }

  if (entries.length === 0) {
    console.log(chalk.dim(`  No skill sets found in "${rootDir}".\n`));
    console.log(chalk.dim('  Run `ysgen generate` to create your first skill set.\n'));
    return;
  }

  // Sort by generatedAt descending
  entries.sort((a, b) => {
    return new Date(b.manifest.generatedAt).getTime() - new Date(a.manifest.generatedAt).getTime();
  });

  // ── Table header ────────────────────────────────────────────────────────────
  const c = {
    brand:   chalk.hex('#6366f1'),
    accent:  chalk.hex('#8b5cf6'),
    muted:   chalk.hex('#71717a'),
    bold:    chalk.bold,
    success: chalk.hex('#22c55e'),
  };

  console.log(`\n${c.brand('◆')} ${c.bold(`${entries.length} skill set(s) found`)}\n`);

  for (const { dir, manifest } of entries) {
    const source = manifest.source.displayName ?? manifest.source.originalUrl;
    const date   = new Date(manifest.generatedAt).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
    const skillCount = manifest.skills.length;
    const videoCount = manifest.videosWithTranscripts;

    console.log(
      `  ${c.accent('◇')} ${c.bold(source)}\n` +
      `    ${c.muted('dir:')}     ${chalk.underline(dir)}\n` +
      `    ${c.muted('date:')}    ${date}\n` +
      `    ${c.muted('skills:')}  ${skillCount}  ${c.muted('·')}  ${c.muted('videos:')} ${videoCount}\n`,
    );

    for (const skill of manifest.skills) {
      console.log(`      ${c.muted('·')} ${skill.name}`);
      if (skill.description) {
        const desc = skill.description.length > 70
          ? skill.description.slice(0, 67) + '...'
          : skill.description;
        console.log(`        ${c.muted(desc)}`);
      }
    }

    console.log('');
  }

  // ── Hints ────────────────────────────────────────────────────────────────────
  console.log(
    c.muted('  Tip: run `ysgen update <dir>` to fetch new videos from the same source.') + '\n',
  );
}
