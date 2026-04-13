import * as readline from 'node:readline';
import { Chalk } from 'chalk';

const chalk = new Chalk({ level: 3 });

function enableWindowsVTP(): void {
  if (process.platform !== 'win32') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { dlopen, FFIType } = require('bun:ffi') as any;
    const lib = dlopen('kernel32', {
      GetStdHandle:   { args: [FFIType.i32],             returns: FFIType.ptr  },
      GetConsoleMode: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.bool },
      SetConsoleMode: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.bool },
    });
    const handle = lib.symbols.GetStdHandle(-11);
    const modeBuf = Buffer.alloc(4);
    lib.symbols.GetConsoleMode(handle, modeBuf);
    lib.symbols.SetConsoleMode(handle, modeBuf.readUInt32LE(0) | 0x0001 | 0x0004);
    lib.close();
  } catch {}
}

enableWindowsVTP();

const c = {
  brand:   chalk.hex('#6366f1'),
  accent:  chalk.hex('#8b5cf6'),
  success: chalk.hex('#22c55e'),
  warn:    chalk.hex('#f59e0b'),
  muted:   chalk.hex('#71717a'),
  bold:    chalk.bold,
  dim:     chalk.dim,
  selBg:   chalk.bgHex('#1e1b4b'),
  selFg:   chalk.hex('#c4b5fd').bold,
  selHint: chalk.hex('#818cf8'),
  selNum:  chalk.hex('#a5b4fc').bold,
};

const CIRCLED = ['❶','❷','❸','❹','❺','❻','❼','❽','❾','❿'];
const INNER   = 56;

const ESC         = '\x1B';
const CURSOR_HIDE = `${ESC}[?25l`;
const CURSOR_SHOW = `${ESC}[?25h`;
const CLEAR_LINE  = `${ESC}[2K\r`;
const moveUp      = (n: number) => `${ESC}[${n}A`;

function out(s: string) { process.stdout.write(s); }
function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

function canAnimate(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.TERM === 'dumb') return false;
  if (process.stdout.fd !== 1 && process.stdout.fd !== undefined) return false;
  return true;
}

export async function typewrite(text: string, delayMs = 16): Promise<void> {
  if (!canAnimate()) { out(text); return; }
  for (const ch of text) { out(ch); await sleep(delayMs); }
}

const LOGO_LINES = [
  '██╗   ██╗███████╗ ██████╗ ███████╗███╗   ██╗',
  '╚██╗ ██╔╝██╔════╝██╔════╝ ██╔════╝████╗  ██║',
  ' ╚████╔╝ ███████╗██║  ███╗█████╗  ██╔██╗ ██║',
  '  ╚██╔╝  ╚════██║██║   ██║██╔══╝  ██║╚██╗██║',
  '   ██║   ███████║╚██████╔╝███████╗██║ ╚████║ ',
  '   ╚═╝   ╚══════╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝',
];

const B = { r: 99,  g: 102, b: 241 };
const A = { r: 139, g: 92,  b: 246 };

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

export async function printBannerAnimated(): Promise<void> {
  out('\n');
  const animate = canAnimate();
  out(CURSOR_HIDE);

  for (const line of LOGO_LINES) {
    out('  ');
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === ' ') { out(' '); continue; }
      const t = col / Math.max(1, line.length - 1);
      out(chalk.rgb(lerp(B.r, A.r, t), lerp(B.g, A.g, t), lerp(B.b, A.b, t))(ch));
      if (animate) await sleep(3);
    }
    out('\n');
    if (animate) await sleep(30);
  }

  out(CURSOR_SHOW);
  out('\n  ');
  await typewrite('YouTube Skills Generator', 20);
  out(`  ${chalk.hex('#4338ca')('→')}  `);
  await typewrite('Claude Code Skills', 16);
  out('\n');
  out(`  ${chalk.dim('gemini  ·  claude  ·  multilingual  ·  auto-cache')}\n\n`);
}

export interface SelectOption<T> {
  value: T;
  label: string;
  hint?: string;
}

function eraseLines(n: number) {
  out(moveUp(n));
  for (let i = 0; i < n; i++) {
    out(CLEAR_LINE);
    if (i < n - 1) out(`${ESC}[1B`);
  }
  out(moveUp(n - 1));
}

function renderSelect<T>(label: string, options: SelectOption<T>[], selectedIdx: number): number {
  const dashes = c.muted('─'.repeat(INNER));
  const lines: string[] = [];

  lines.push(`  ${c.brand('◆')} ${c.bold(label)}`);
  lines.push(`  ${c.muted('╭')}${dashes}${c.muted('╮')}`);

  for (let i = 0; i < options.length; i++) {
    const opt    = options[i];
    const isSel  = i === selectedIdx;
    const num    = CIRCLED[i] ?? String(i + 1);
    const hint   = opt.hint ?? '';
    const visLen = 6 + num.length + opt.label.length + (hint ? 2 + hint.length : 0);
    const pad    = Math.max(0, INNER - visLen);

    let content: string;
    if (isSel) {
      const inner = `  ${c.brand('▶')} ${c.selNum(num)}  ${c.selFg(opt.label)}${hint ? `  ${c.selHint(hint)}` : ''}${' '.repeat(pad)}`;
      content = `  ${c.brand('│')}${c.selBg(inner)}${c.brand('│')}`;
    } else {
      const inner = `    ${c.muted(num)}  ${opt.label}${hint ? `  ${c.muted(hint)}` : ''}${' '.repeat(pad)}`;
      content = `  ${c.muted('│')}${inner}${c.muted('│')}`;
    }
    lines.push(content);
  }

  lines.push(`  ${c.muted('╰')}${dashes}${c.muted('╯')}`);
  lines.push(`  ${c.muted('↑ ↓')} ${chalk.dim('navigate')}    ${c.muted('Enter')} ${chalk.dim('confirm')}    ${chalk.hex('#ef4444').dim('Ctrl+C')} ${chalk.dim('quit')}`);

  for (const line of lines) out(line + '\n');
  return lines.length;
}

export async function wizardSelect<T>(
  label: string,
  options: SelectOption<T>[],
  defaultIndex = 0,
): Promise<T> {
  out('\n');
  out(CURSOR_HIDE);

  let selected  = defaultIndex;
  let lineCount = renderSelect(label, options, selected);

  let rawModeActive = false;
  try { process.stdin.setRawMode(true); rawModeActive = true; } catch {}

  readline.emitKeypressEvents(process.stdin);
  process.stdin.resume();
  if (!rawModeActive) process.stdin.setEncoding('utf8');

  return new Promise<T>((resolve) => {
    const keypressHandler = (_str: string | undefined, key: readline.Key) => {
      if (!key) return;

      if (key.name === 'c' && key.ctrl) {
        out(CURSOR_SHOW);
        console.log('\n' + c.muted('  Cancelled.'));
        process.exit(0);
      }

      let changed = false;
      if (key.name === 'up'   || key.name === 'left')  { selected = (selected - 1 + options.length) % options.length; changed = true; }
      if (key.name === 'down' || key.name === 'right') { selected = (selected + 1) % options.length; changed = true; }

      if (key.name === 'return' || key.name === 'enter' || key.name === 'space') {
        process.stdin.removeListener('keypress', keypressHandler);
        if (rawModeActive) { try { process.stdin.setRawMode(false); } catch {} }
        process.stdin.pause();
        process.stdin.setEncoding('utf8');

        eraseLines(lineCount + 1);
        out('\n');
        const chosen = options[selected];
        out(`  ${c.success('◇')} ${c.bold(label)}  ${c.muted('→')}  ${c.brand.bold(chosen.label)}\n`);
        out(CURSOR_SHOW);
        process.nextTick(() => resolve(chosen.value));
        return;
      }

      if (changed) {
        eraseLines(lineCount);
        lineCount = renderSelect(label, options, selected);
      }
    };

    process.stdin.on('keypress', keypressHandler);
  });
}

let _rl: readline.Interface | null = null;

function getRL(): readline.Interface {
  if (!_rl) {
    _rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    _rl.on('SIGINT', () => { _rl?.close(); console.log('\n' + c.muted('  Cancelled.')); process.exit(0); });
  }
  return _rl;
}

export function closeWizard(): void { _rl?.close(); _rl = null; }

async function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => getRL().question(prompt, resolve));
}

export async function wizardInput(
  label: string,
  opts: { default?: string; placeholder?: string; validate?: (v: string) => string | undefined } = {},
): Promise<string> {
  const hint = opts.default
    ? chalk.dim(`  (${opts.default})`)
    : opts.placeholder
      ? chalk.dim(`  e.g. ${opts.placeholder}`)
      : '';

  while (true) {
    console.log(`\n  ${c.brand('◆')} ${c.bold(label)}${hint}`);
    const raw   = (await ask(`  ${c.brand('▸')}  `)).trim();
    const value = raw || opts.default || '';

    if (!value) { console.log(`  ${c.warn('⚠')}  This field is required`); continue; }

    if (opts.validate) {
      const err = opts.validate(value);
      if (err) { console.log(`  ${c.warn('⚠')}  ${err}`); continue; }
    }

    console.log(`  ${c.success('◇')}  ${c.muted(value)}`);
    return value;
  }
}

export async function wizardConfirm(label: string, defaultValue = true): Promise<boolean> {
  const hint = chalk.dim(defaultValue ? '  [Y/n]' : '  [y/N]');
  console.log(`\n  ${c.brand('◆')} ${c.bold(label)}${hint}`);
  const raw    = (await ask(`  ${c.brand('▸')}  `)).trim().toLowerCase();
  const result = raw === '' ? defaultValue : raw.startsWith('y');
  console.log(`  ${c.success('◇')}  ${result ? 'Yes' : 'No'}`);
  return result;
}
