import chalk from 'chalk';

// ─────────────────────────────────────────────────────────────────────────────
// Custom Braille spinner — works on every modern terminal, no library fallbacks
// ─────────────────────────────────────────────────────────────────────────────

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const BRAND = chalk.hex('#6366f1');

export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private fi    = 0;
  private msg   = '';

  start(message: string): void {
    this.msg = message;
    this.fi  = 0;

    if (!process.stdout.isTTY) {
      process.stdout.write(`  …  ${message}\n`);
      return;
    }

    process.stdout.write('\x1b[?25l'); // hide cursor
    this.render();
    this.timer = setInterval(() => this.render(), 80);
  }

  message(text: string): void {
    this.msg = text;
    if (process.stdout.isTTY && this.timer) this.render();
  }

  stop(finalLine?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (process.stdout.isTTY) {
      process.stdout.write('\r\x1b[2K'); // clear spinner line
      process.stdout.write('\x1b[?25h'); // restore cursor
    }
    if (finalLine) process.stdout.write(finalLine + '\n');
  }

  private render(): void {
    const frame = BRAND(FRAMES[this.fi % FRAMES.length]);
    this.fi++;
    // \r returns to line start; trailing spaces erase any leftover chars
    process.stdout.write(`\r  ${frame}  ${this.msg}                              `);
  }
}
