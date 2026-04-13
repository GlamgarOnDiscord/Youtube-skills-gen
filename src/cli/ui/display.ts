import chalk from 'chalk';
import type { PipelineResult, GeneratedSkill } from '../../domain/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Terminal display helpers — rich, consistent output
// ─────────────────────────────────────────────────────────────────────────────

const c = {
  brand: chalk.hex('#6366f1'),      // indigo
  accent: chalk.hex('#8b5cf6'),     // violet
  success: chalk.hex('#22c55e'),    // green
  warn: chalk.hex('#f59e0b'),       // amber
  error: chalk.hex('#ef4444'),      // red
  muted: chalk.hex('#71717a'),      // zinc
  bold: chalk.bold,
  dim: chalk.dim,
};

const BOX_WIDTH = 60;

/** ╭─────────────╮ style box around content */
export function box(lines: string[], title?: string): string {
  const border = '─'.repeat(BOX_WIDTH - 2);
  const top = title
    ? `╭─ ${c.brand(title)} ${'─'.repeat(Math.max(0, BOX_WIDTH - title.length - 5))}╮`
    : `╭${border}╮`;
  const bottom = `╰${border}╯`;

  const wrapped = lines.map((l) => {
    const stripped = stripAnsi(l);
    const pad = Math.max(0, BOX_WIDTH - stripped.length - 4);
    return `│ ${l}${' '.repeat(pad)} │`;
  });

  return [top, ...wrapped, bottom].join('\n');
}

/** Strip ANSI escape codes for length calculation */
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

/** Horizontal rule */
export function hr(char = '─'): string {
  return c.muted(char.repeat(BOX_WIDTH));
}

/** Section header */
export function sectionHeader(label: string): string {
  return `\n${c.brand('◆')} ${c.bold(label)}`;
}

/** Success tick prefix */
export function ok(msg: string): string {
  return `  ${c.success('✓')} ${msg}`;
}

/** Warning prefix */
export function warn(msg: string): string {
  return `  ${c.warn('⚠')} ${msg}`;
}

/** Error prefix */
export function err(msg: string): string {
  return `  ${c.error('✖')} ${msg}`;
}

/** Info bullet */
export function info(msg: string): string {
  return `  ${c.muted('·')} ${msg}`;
}

/** Simple progress bar */
export function progressBar(current: number, total: number, width = 28): string {
  const pct = total > 0 ? current / total : 0;
  const filled = Math.round(width * pct);
  const empty = width - filled;
  const bar = c.brand('█'.repeat(filled)) + c.muted('░'.repeat(empty));
  return `[${bar}] ${current}/${total}`;
}

/** Format bytes to human-readable */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format ms duration to human-readable */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Print the final summary after pipeline completion.
 */
export function printSummary(result: PipelineResult): void {
  const lines: string[] = [];

  if (result.success) {
    const skillWord = result.skillsGenerated === 1 ? 'skill' : 'skills';
    lines.push(
      ok(c.bold(`${result.skillsGenerated} ${skillWord} generated`)) +
      c.muted(`  ·  ${formatDuration(result.durationMs)}`),
    );
  } else {
    lines.push(err(c.bold('Pipeline failed') + c.muted(`  ·  ${formatDuration(result.durationMs)}`)));
  }

  // Skills list
  const skills = result.skills;
  if (skills && skills.length > 0) {
    lines.push('');
    for (const skill of skills) {
      lines.push(`  ${c.accent('◇')} ${c.bold(skill.skillName)}`);
      // Truncate description to fit box
      const desc = skill.skillDescription.length > BOX_WIDTH - 8
        ? skill.skillDescription.slice(0, BOX_WIDTH - 11) + '...'
        : skill.skillDescription;
      lines.push(`    ${c.muted(desc)}`);
    }
  }

  lines.push('');

  // Video stats on one line
  const skippedNote = result.videosSkipped > 0 ? `, ${result.videosSkipped} skipped` : '';
  lines.push(info(`${result.videosProcessed} videos · ${result.videosWithTranscripts} with transcripts${skippedNote}`));

  // Output path — use result.outputDir directly (cross-platform)
  if (result.outputDir) {
    lines.push(info(`${chalk.underline(result.outputDir)}`));
  }

  if (result.errors.length > 0) {
    lines.push('');
    for (const e of result.errors) {
      lines.push(warn(e));
    }
  }

  console.log('\n' + box(lines, result.success ? 'Complete' : 'Failed') + '\n');
}

/**
 * Print a skill preview (name + first few lines of content)
 */
export function printSkillPreview(skill: GeneratedSkill, index: number, total: number): void {
  const lines = skill.content.split('\n').slice(0, 12);
  const preview = lines.join('\n');

  console.log(
    `\n${c.brand('◆')} Skill ${index + 1}/${total}: ${c.bold(skill.skillName)}\n` +
    c.dim(preview) + '\n' +
    c.muted('─'.repeat(40)),
  );
}

/** Print an error in a clean format */
export function printError(title: string, message: string, hint?: string): void {
  console.error('');
  console.error(err(c.bold(title)));
  console.error(`  ${message}`);
  if (hint) {
    console.error('');
    console.error(`  ${c.dim('Hint:')} ${hint}`);
  }
  console.error('');
}

/** Print CLI banner */
export function printBanner(): void {
  console.log(
    '\n' +
    box([
      '',
      c.brand.bold('  ✦  YouTube Skills Generator'),
      c.muted('  Transform YouTube content into Claude Code Skills'),
      '',
    ]) +
    '\n',
  );
}
