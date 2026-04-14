import chalk from 'chalk';
import { validateUrl, resolveSource } from '../../providers/youtube/resolver.ts';
import type { YouTubeSource } from '../../domain/index.ts';
import {
  wizardSelect,
  wizardInput,
  wizardConfirm,
  closeWizard,
} from './wizard.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Interactive wizard — all prompts now use the custom readline wizard (wizard.ts)
// instead of @clack/prompts, which falls back to ASCII art on Windows.
// ─────────────────────────────────────────────────────────────────────────────

/** Prompt for the input mode (channel / playlist / video(s) / manual) */
export async function promptInputMode(): Promise<'channel' | 'playlist' | 'videos' | 'manual'> {
  return wizardSelect('What do you want to process?', [
    { value: 'channel', label: 'YouTube Channel',        hint: '@channelname or /channel/ID' },
    { value: 'playlist', label: 'YouTube Playlist',     hint: 'playlist?list=PLxxx' },
    { value: 'videos',  label: 'One or more video URLs', hint: 'youtu.be/xxx, ...' },
    { value: 'manual',  label: 'Manual video IDs',       hint: 'raw IDs, comma-separated' },
  ]) as Promise<'channel' | 'playlist' | 'videos' | 'manual'>;
}

/** Prompt for a single YouTube URL */
export async function promptSingleUrl(
  message: string,
  placeholder?: string,
): Promise<string> {
  return wizardInput(message, {
    placeholder,
    validate: (v) => {
      const result = validateUrl(v);
      return result.valid ? undefined : result.reason;
    },
  });
}

/** Prompt for multiple video URLs (comma-separated or one per line) */
export async function promptMultipleUrls(): Promise<string[]> {
  const raw = await wizardInput('Video URLs  (comma or newline separated)', {
    placeholder: 'https://youtu.be/xxx, https://youtu.be/yyy',
    validate: (v) => (v.trim() ? undefined : 'At least one URL is required'),
  });

  const urls = raw.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean);
  const invalid = urls.filter((u) => !validateUrl(u).valid);
  if (invalid.length > 0) {
    console.log(chalk.dim(`  ${chalk.yellow('⚠')}  Skipping ${invalid.length} invalid URL(s)`));
  }
  return urls.filter((u) => validateUrl(u).valid);
}

/** Prompt for manual video IDs */
export async function promptVideoIds(): Promise<string[]> {
  const raw = await wizardInput('Video IDs  (comma or newline separated)', {
    placeholder: 'dQw4w9WgXcQ, abc123...',
    validate: (v) => (v.trim() ? undefined : 'At least one video ID is required'),
  });

  return raw.split(/[\n,]+/).map((id) => id.trim()).filter((id) => id.length >= 11);
}

/** Prompt for output directory */
export async function promptOutputDir(defaultDir: string): Promise<string> {
  return wizardInput('Output directory', { default: defaultDir, placeholder: './output' });
}

/** Prompt for max videos limit */
export async function promptMaxVideos(): Promise<number> {
  const choice = await wizardSelect<string>('How many videos to process?', [
    { value: '0',      label: 'All videos',        hint: 'may be slow for large channels' },
    { value: '20',     label: 'First 20 videos' },
    { value: '50',     label: 'First 50 videos' },
    { value: '100',    label: 'First 100 videos' },
    { value: 'custom', label: 'Custom limit' },
  ], 2);

  if (choice === 'custom') {
    const n = await wizardInput('Maximum number of videos', {
      placeholder: '50',
      validate: (v) => {
        const n = parseInt(v);
        return isNaN(n) || n < 1 ? 'Enter a positive number' : undefined;
      },
    });
    return parseInt(n);
  }

  return parseInt(choice);
}

/** Prompt for max skills */
export async function promptMaxSkills(): Promise<number> {
  const choice = await wizardSelect<string>('How many skills to generate?', [
    { value: '1',      label: '1 skill',   hint: 'focused channels' },
    { value: '3',      label: '3 skills',  hint: 'recommended' },
    { value: '5',      label: '5 skills',  hint: 'broad channels' },
    { value: 'custom', label: 'Custom' },
  ], 1);

  if (choice === 'custom') {
    const n = await wizardInput('Maximum number of skills', {
      placeholder: '3',
      validate: (v) => {
        const n = parseInt(v);
        return isNaN(n) || n < 1 || n > 10 ? 'Enter a number between 1 and 10' : undefined;
      },
    });
    return parseInt(n);
  }

  return parseInt(choice);
}

/** Confirm action before proceeding */
export async function promptConfirm(message: string): Promise<boolean> {
  return wizardConfirm(message);
}

/** Prompt for LLM provider */
async function promptProvider(): Promise<'gemini' | 'claude'> {
  return wizardSelect('LLM provider', [
    { value: 'gemini', label: 'Gemini',  hint: 'gemini-3.1-pro  (GEMINI_API_KEY)' },
    { value: 'claude', label: 'Claude',  hint: 'claude-opus-4-6  (ANTHROPIC_API_KEY)' },
  ]) as Promise<'gemini' | 'claude'>;
}

/** Prompt for output language */
async function promptOutputLang(): Promise<string | undefined> {
  const choice = await wizardSelect<string>('Skill language', [
    { value: 'en',     label: 'English',   hint: 'default' },
    { value: 'fr',     label: 'Français' },
    { value: 'de',     label: 'Deutsch' },
    { value: 'es',     label: 'Español' },
    { value: 'ja',     label: '日本語' },
    { value: 'custom', label: 'Other…' },
  ], 0);

  if (choice === 'custom') {
    const lang = await wizardInput('Language code', { placeholder: 'pt, ko, zh, ar…' });
    return lang;
  }
  return choice === 'en' ? undefined : choice;
}

// ── Full wizard ───────────────────────────────────────────────────────────────

export interface WizardResult {
  sources: YouTubeSource[];
  maxVideos: number;
  maxSkills: number;
  outputDir: string;
  skipNoTranscript: boolean;
  provider: 'gemini' | 'claude';
  outputLang?: string;
}

export async function runInteractiveWizard(defaultOutputDir: string): Promise<WizardResult> {
  const mode = await promptInputMode();

  let sources: YouTubeSource[] = [];

  if (mode === 'channel') {
    const url = await promptSingleUrl('Channel URL', 'https://www.youtube.com/@channelname');
    sources.push(resolveSource(url));
  } else if (mode === 'playlist') {
    const url = await promptSingleUrl('Playlist URL', 'https://www.youtube.com/playlist?list=PLxxx');
    sources.push(resolveSource(url));
  } else if (mode === 'videos') {
    const urls = await promptMultipleUrls();
    sources = urls.map((u) => resolveSource(u));
  } else {
    const ids = await promptVideoIds();
    sources.push({
      type: 'manual',
      originalUrl: 'manual-input',
      resolvedId: ids.join(','),
      displayName: 'Manual Input',
    });
  }

  const needsVideoLimit  = mode === 'channel' || mode === 'playlist';
  const maxVideos        = needsVideoLimit ? await promptMaxVideos() : 0;
  const maxSkills        = await promptMaxSkills();
  const provider         = await promptProvider();
  const outputLang       = await promptOutputLang();
  const skipNoTranscript = await wizardConfirm('Skip videos without transcripts?', true);
  const outputDir        = await promptOutputDir(defaultOutputDir);

  // Release the readline interface before the pipeline spinner takes over
  closeWizard();
  console.log('');

  return { sources, maxVideos, maxSkills, outputDir, skipNoTranscript, provider, outputLang };
}
