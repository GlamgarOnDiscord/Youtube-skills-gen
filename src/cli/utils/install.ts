import { cp, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import chalk from 'chalk';
import { ok, warn } from '../ui/display.ts';

export function getClaudeSkillsDir(): string {
  return join(homedir(), '.claude', 'skills');
}

export function buildInstallCommand(outputDir: string): string {
  const os = platform();
  const skillsDir = getClaudeSkillsDir();

  if (os === 'win32') {
    return `xcopy /E /I /Y "${outputDir}\\*" "${skillsDir}\\"`;
  }
  return `cp -r "${outputDir}"/* "${skillsDir}/"`;
}

export async function installSkills(outputDir: string): Promise<void> {
  const destDir = getClaudeSkillsDir();
  const os = platform();

  try {
    await mkdir(destDir, { recursive: true });
    await cp(resolve(outputDir), destDir, { recursive: true });

    const displayDest = os === 'win32'
      ? destDir.replace(/\//g, '\\')
      : destDir;

    console.log(ok(chalk.bold(`Skills installed to ${displayDest}`)));
    console.log(chalk.dim(`  Ready to use with Claude Code: /<skill-name>`));
    console.log('');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(warn(`Could not auto-install: ${msg}`));
    console.log(chalk.dim(`  Run manually: ${buildInstallCommand(outputDir)}`));
    console.log('');
  }
}
