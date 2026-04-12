import chalk from 'chalk';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal structured logger — writes to stderr to keep stdout clean for output
// ─────────────────────────────────────────────────────────────────────────────

type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

let _level: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  _level = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] <= LEVELS[_level];
}

function fmt(level: LogLevel, msg: string, meta?: Record<string, unknown>): string {
  const prefix = {
    error: chalk.red('✖'),
    warn: chalk.yellow('⚠'),
    info: chalk.blue('◆'),
    debug: chalk.gray('·'),
    silent: '',
  }[level];

  const metaStr =
    meta && Object.keys(meta).length > 0
      ? chalk.gray(' ' + JSON.stringify(meta))
      : '';

  return `${prefix} ${msg}${metaStr}`;
}

const logger = {
  error(msg: string, meta?: Record<string, unknown>): void {
    if (shouldLog('error')) process.stderr.write(fmt('error', chalk.red(msg), meta) + '\n');
  },

  warn(msg: string, meta?: Record<string, unknown>): void {
    if (shouldLog('warn')) process.stderr.write(fmt('warn', chalk.yellow(msg), meta) + '\n');
  },

  info(msg: string, meta?: Record<string, unknown>): void {
    if (shouldLog('info')) process.stderr.write(fmt('info', msg, meta) + '\n');
  },

  debug(msg: string, meta?: Record<string, unknown>): void {
    if (shouldLog('debug')) process.stderr.write(fmt('debug', chalk.gray(msg), meta) + '\n');
  },

  /** Write a plain line to stderr (for debug dumps, etc.) */
  raw(msg: string): void {
    process.stderr.write(msg + '\n');
  },
};

export default logger;
