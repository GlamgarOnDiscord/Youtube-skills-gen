import * as p from '@clack/prompts';
import chalk from 'chalk';
import { validateUrl, resolveSource } from '../../providers/youtube/resolver.ts';
import type { YouTubeSource } from '../../domain/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Interactive prompts — @clack/prompts wrappers for the wizard flow
// ─────────────────────────────────────────────────────────────────────────────

export function handleCancel(): never {
  p.cancel('Aborted.');
  process.exit(0);
}

function assertNotCancel<T>(value: T | symbol): T {
  if (p.isCancel(value)) handleCancel();
  return value as T;
}

/** Prompt for the input mode (channel / playlist / video(s) / manual) */
export async function promptInputMode(): Promise<'channel' | 'playlist' | 'videos' | 'manual'> {
  const mode = await p.select({
    message: 'What do you want to process?',
    options: [
      {
        value: 'channel',
        label: 'YouTube Channel',
        hint: 'e.g. https://www.youtube.com/@channelname',
      },
      {
        value: 'playlist',
        label: 'YouTube Playlist',
        hint: 'e.g. https://www.youtube.com/playlist?list=PLxxx',
      },
      {
        value: 'videos',
        label: 'One or more video URLs',
        hint: 'Paste individual video links',
      },
      {
        value: 'manual',
        label: 'Manual video IDs',
        hint: 'Enter video IDs directly',
      },
    ],
  });

  return assertNotCancel(mode) as 'channel' | 'playlist' | 'videos' | 'manual';
}

/** Prompt for a single YouTube URL */
export async function promptSingleUrl(
  message: string,
  placeholder?: string,
): Promise<string> {
  const url = await p.text({
    message,
    placeholder: placeholder ?? 'https://www.youtube.com/...',
    validate: (v) => {
      const result = validateUrl(v);
      return result.valid ? undefined : result.reason;
    },
  });

  return assertNotCancel(url) as string;
}

/** Prompt for multiple video URLs (one per line, or comma-separated) */
export async function promptMultipleUrls(): Promise<string[]> {
  const input = await p.text({
    message: 'Enter video URLs (one per line, or comma-separated):',
    placeholder: 'https://youtu.be/xxx, https://youtu.be/yyy',
    validate: (v) => {
      if (!v.trim()) return 'At least one URL is required';
      return undefined;
    },
  });

  const raw = assertNotCancel(input) as string;
  const urls = raw
    .split(/[\n,]+/)
    .map((u) => u.trim())
    .filter(Boolean);

  const invalid = urls.filter((u) => !validateUrl(u).valid);
  if (invalid.length > 0) {
    console.log(chalk.yellow(`  ⚠ Skipping ${invalid.length} invalid URL(s)`));
  }

  return urls.filter((u) => validateUrl(u).valid);
}

/** Prompt for manual video IDs */
export async function promptVideoIds(): Promise<string[]> {
  const input = await p.text({
    message: 'Enter video IDs (comma-separated or one per line):',
    placeholder: 'dQw4w9WgXcQ, abc123...',
    validate: (v) => {
      if (!v.trim()) return 'At least one video ID is required';
      return undefined;
    },
  });

  const raw = assertNotCancel(input) as string;
  return raw
    .split(/[\n,]+/)
    .map((id) => id.trim())
    .filter((id) => id.length >= 11);
}

/** Prompt for output directory */
export async function promptOutputDir(defaultDir: string): Promise<string> {
  const dir = await p.text({
    message: 'Output directory:',
    initialValue: defaultDir,
    placeholder: './output',
  });

  return assertNotCancel(dir) as string;
}

/** Prompt for max videos limit */
export async function promptMaxVideos(): Promise<number> {
  const choice = await p.select({
    message: 'How many videos to process?',
    options: [
      { value: '0', label: 'All videos', hint: 'May be slow for large channels' },
      { value: '20', label: 'First 20 videos' },
      { value: '50', label: 'First 50 videos' },
      { value: '100', label: 'First 100 videos' },
      { value: 'custom', label: 'Custom limit' },
    ],
  });

  const sel = assertNotCancel(choice) as string;
  if (sel === 'custom') {
    const n = await p.text({
      message: 'Enter maximum number of videos:',
      placeholder: '50',
      validate: (v) => {
        const n = parseInt(v);
        if (isNaN(n) || n < 1) return 'Enter a positive number';
        return undefined;
      },
    });
    return parseInt(assertNotCancel(n) as string);
  }

  return parseInt(sel);
}

/** Prompt for max skills */
export async function promptMaxSkills(): Promise<number> {
  const choice = await p.select({
    message: 'How many skills to generate?',
    options: [
      { value: '1', label: '1 skill', hint: 'Best for focused channels' },
      { value: '3', label: '3 skills', hint: 'Recommended' },
      { value: '5', label: '5 skills', hint: 'For broad channels' },
      { value: 'custom', label: 'Custom' },
    ],
    initialValue: '3',
  });

  const sel = assertNotCancel(choice) as string;
  if (sel === 'custom') {
    const n = await p.text({
      message: 'Maximum number of skills:',
      placeholder: '3',
      validate: (v) => {
        const n = parseInt(v);
        if (isNaN(n) || n < 1 || n > 10) return 'Enter a number between 1 and 10';
        return undefined;
      },
    });
    return parseInt(assertNotCancel(n) as string);
  }

  return parseInt(sel);
}

/** Confirm action before proceeding */
export async function promptConfirm(message: string): Promise<boolean> {
  const confirmed = await p.confirm({ message });
  return assertNotCancel(confirmed) as boolean;
}

/**
 * Full interactive wizard — returns a fully configured set of sources and options.
 */
export interface WizardResult {
  sources: YouTubeSource[];
  maxVideos: number;
  maxSkills: number;
  outputDir: string;
  skipNoTranscript: boolean;
}

export async function runInteractiveWizard(defaultOutputDir: string): Promise<WizardResult> {
  p.intro(chalk.bold.hex('#6366f1')('  YouTube Skills Generator'));

  const mode = await promptInputMode();

  let sources: YouTubeSource[] = [];

  if (mode === 'channel') {
    const url = await promptSingleUrl(
      'Channel URL:',
      'https://www.youtube.com/@channelname',
    );
    sources.push(resolveSource(url));
  } else if (mode === 'playlist') {
    const url = await promptSingleUrl(
      'Playlist URL:',
      'https://www.youtube.com/playlist?list=PLxxx',
    );
    sources.push(resolveSource(url));
  } else if (mode === 'videos') {
    const urls = await promptMultipleUrls();
    sources = urls.map((u) => resolveSource(u));
  } else {
    // manual
    const ids = await promptVideoIds();
    sources.push({
      type: 'manual',
      originalUrl: 'manual-input',
      resolvedId: ids.join(','),
      displayName: 'Manual Input',
    });
  }

  const maxVideos = await promptMaxVideos();
  const maxSkills = await promptMaxSkills();

  const skipNoTranscript = await p.confirm({
    message: 'Skip videos without transcripts?',
    active: 'Yes',
    inactive: 'No (include with empty transcript)',
    initialValue: true,
  });

  const outputDir = await promptOutputDir(defaultOutputDir);

  p.outro(chalk.dim('Starting pipeline...'));

  return {
    sources,
    maxVideos,
    maxSkills,
    outputDir: assertNotCancel(outputDir) as string,
    skipNoTranscript: assertNotCancel(skipNoTranscript) as boolean,
  };
}
