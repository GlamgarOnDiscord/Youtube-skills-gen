import * as readline from 'node:readline';
import chalk from 'chalk';

// ─────────────────────────────────────────────────────────────────────────────
// Custom readline wizard — Unicode prompts that work on every platform.
// @clack/prompts falls back to ASCII on Windows (T, |, *, —) even when the
// terminal supports Unicode. This module draws prompts directly.
// ─────────────────────────────────────────────────────────────────────────────

const c = {
  brand:   chalk.hex('#6366f1'),
  success: chalk.hex('#22c55e'),
  warn:    chalk.hex('#f59e0b'),
  muted:   chalk.hex('#71717a'),
};

// Enclosed circled digits ❶–❿ look premium without any background colors
const CIRCLED = ['❶','❷','❸','❹','❺','❻','❼','❽','❾','❿'];

// Inner content width for the options box (visible chars only, no ANSI)
const INNER = 56;

// ── Singleton readline interface ──────────────────────────────────────────────

let _rl: readline.Interface | null = null;

function getRL(): readline.Interface {
  if (!_rl) {
    _rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    _rl.on('SIGINT', () => {
      _rl?.close();
      console.log('\n' + chalk.dim('  Cancelled.'));
      process.exit(0);
    });
  }
  return _rl;
}

export function closeWizard(): void {
  _rl?.close();
  _rl = null;
}

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => getRL().question(prompt, resolve));
}

// ── Select (numbered menu inside a box) ──────────────────────────────────────

export interface SelectOption<T> {
  value: T;
  label: string;
  hint?: string;
}

export async function wizardSelect<T>(
  label: string,
  options: SelectOption<T>[],
  defaultIndex = 0,
): Promise<T> {
  console.log(`\n  ${c.brand('◆')} ${chalk.bold(label)}`);

  const dashes = c.muted('─'.repeat(INNER));
  console.log(`\n  ${c.muted('╭')}${dashes}${c.muted('╮')}`);

  for (let i = 0; i < options.length; i++) {
    const opt       = options[i];
    const isDefault = i === defaultIndex;
    const numChar   = CIRCLED[i] ?? String(i + 1);
    const hintText  = opt.hint ?? '';
    const defMark   = isDefault ? '  ◄' : '';

    // Measure visible chars (no ANSI) to compute padding
    const visLen = 2 + 1 + 2 + opt.label.length + (hintText ? 2 + hintText.length : 0) + defMark.length;
    const pad    = Math.max(0, INNER - visLen);

    // Build colored content
    const num     = c.brand.bold(numChar);
    const hint    = hintText ? `  ${c.muted(hintText)}` : '';
    const def     = isDefault ? `  ${c.muted('◄')}` : '';
    const content = `  ${num}  ${opt.label}${hint}${def}${' '.repeat(pad)}`;

    console.log(`  ${c.muted('│')}${content}${c.muted('│')}`);
  }

  console.log(`  ${c.muted('╰')}${dashes}${c.muted('╯')}\n`);

  while (true) {
    const raw = (await ask(`  ${c.brand('▸')} [${defaultIndex + 1}]: `)).trim();
    const n   = raw === '' ? defaultIndex + 1 : parseInt(raw);

    if (!isNaN(n) && n >= 1 && n <= options.length) {
      const chosen = options[n - 1];
      console.log(`  ${c.success('◇')}  ${chalk.bold(chosen.label)}`);
      return chosen.value;
    }
    console.log(`  ${c.warn('⚠')}  Enter a number between 1 and ${options.length}`);
  }
}

// ── Text input ────────────────────────────────────────────────────────────────

export async function wizardInput(
  label: string,
  opts: {
    default?: string;
    placeholder?: string;
    validate?: (v: string) => string | undefined;
  } = {},
): Promise<string> {
  const hint = opts.default
    ? chalk.dim(`  (${opts.default})`)
    : opts.placeholder
      ? chalk.dim(`  e.g. ${opts.placeholder}`)
      : '';

  while (true) {
    console.log(`\n  ${c.brand('◆')} ${chalk.bold(label)}${hint}`);
    const raw   = (await ask(`  ${c.brand('▸')}  `)).trim();
    const value = raw || opts.default || '';

    if (!value) {
      console.log(`  ${c.warn('⚠')}  This field is required`);
      continue;
    }

    if (opts.validate) {
      const err = opts.validate(value);
      if (err) {
        console.log(`  ${c.warn('⚠')}  ${err}`);
        continue;
      }
    }

    console.log(`  ${c.success('◇')}  ${c.muted(value)}`);
    return value;
  }
}

// ── Confirm (y/n) ─────────────────────────────────────────────────────────────

export async function wizardConfirm(label: string, defaultValue = true): Promise<boolean> {
  const hint = chalk.dim(defaultValue ? '  [Y/n]' : '  [y/N]');
  console.log(`\n  ${c.brand('◆')} ${chalk.bold(label)}${hint}`);
  const raw    = (await ask(`  ${c.brand('▸')}  `)).trim().toLowerCase();
  const result = raw === '' ? defaultValue : raw.startsWith('y');
  console.log(`  ${c.success('◇')}  ${result ? 'Yes' : 'No'}`);
  return result;
}
