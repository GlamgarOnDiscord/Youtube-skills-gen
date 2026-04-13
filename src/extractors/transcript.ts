import { YoutubeTranscript } from 'youtube-transcript';
import type { TranscriptSegment } from '../domain/index.ts';
import { MAX_RETRIES, RETRY_DELAY_BASE_MS } from '../config/defaults.ts';
import logger from '../logging/logger.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Transcript extractor — wraps youtube-transcript with retry & error handling
// ─────────────────────────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export interface TranscriptData {
  segments: TranscriptSegment[];
  /** Full concatenated text */
  raw: string;
  /** Detected language code */
  language: string;
}

export type TranscriptFetchReason =
  | 'no-transcript'
  | 'disabled'
  | 'unavailable'
  | 'rate-limited'
  | 'unknown';

export type TranscriptFetchResult =
  | { success: true; data: TranscriptData }
  | { success: false; reason: TranscriptFetchReason; message: string };

/** Classify youtube-transcript errors into our typed categories */
function classifyError(err: unknown): { reason: TranscriptFetchReason; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';

  if (
    name.includes('NotAvailable') ||
    msg.includes('No transcript') ||
    msg.includes('Could not get transcript')
  ) {
    return { reason: 'no-transcript', message: 'No transcript available for this video' };
  }
  if (name.includes('Disabled') || msg.includes('disabled')) {
    return { reason: 'disabled', message: 'Transcripts are disabled for this video' };
  }
  if (name.includes('Unavailable') || msg.includes('unavailable')) {
    return { reason: 'unavailable', message: 'Video is unavailable or private' };
  }
  if (msg.includes('429') || msg.includes('Too Many') || name.includes('TooManyRequests')) {
    return { reason: 'rate-limited', message: 'YouTube rate limit hit — try again later' };
  }

  return { reason: 'unknown', message: msg };
}

/**
 * Fetch transcript for a single video.
 * Tries the requested language first, then falls back to any available transcript.
 * Returns a discriminated union — never throws for expected failures.
 */
export async function fetchTranscript(
  videoId: string,
  lang: string = 'en',
): Promise<TranscriptFetchResult> {
  // Build the list of fetch configs to try in order.
  // If a specific lang is requested, try it first; then fall back to auto-detect
  // (no lang specified = YouTube returns whatever transcript is available).
  const configs: Array<{ lang?: string }> = lang ? [{ lang }, {}] : [{}];

  let lastClassified: { reason: TranscriptFetchReason; message: string } = {
    reason: 'unknown',
    message: 'Transcript fetch failed',
  };

  for (const config of configs) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1);
          logger.debug(`Transcript retry ${attempt} for ${videoId} (${delay}ms)`);
          await sleep(delay);
        }

        const raw = await YoutubeTranscript.fetchTranscript(videoId, config);

        const segments: TranscriptSegment[] = raw.map((s) => ({
          text: s.text,
          offset: s.offset,
          duration: s.duration,
        }));

        const text = segments.map((s) => s.text).join(' ');
        const detectedLang = config.lang ?? 'auto';

        return {
          success: true,
          data: { segments, raw: text, language: detectedLang },
        };
      } catch (err: unknown) {
        const classified = classifyError(err);
        lastClassified = classified;

        if (classified.reason === 'no-transcript') {
          // No transcript in this language — try the next config (e.g. auto-detect)
          break;
        }

        if (classified.reason === 'disabled' || classified.reason === 'unavailable') {
          // Hard failures — no point trying other languages
          return { success: false, ...classified };
        }

        // rate-limited or unknown — retry with backoff
        if (attempt === MAX_RETRIES) {
          // Exhausted retries for this config, try next language config
          break;
        }
      }
    }
  }

  return { success: false, ...lastClassified };
}

/**
 * Batch fetch transcripts for multiple videos.
 * Respects concurrency limit to avoid hammering YouTube.
 */
export async function fetchTranscriptsBatch(
  videoIds: string[],
  lang: string = 'en',
  concurrency: number = 3,
  onProgress?: (done: number, total: number, videoId: string) => void,
): Promise<Map<string, TranscriptFetchResult>> {
  const results = new Map<string, TranscriptFetchResult>();
  let done = 0;

  // Process in chunks of `concurrency`
  for (let i = 0; i < videoIds.length; i += concurrency) {
    const batch = videoIds.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (id) => {
        const result = await fetchTranscript(id, lang);
        done++;
        onProgress?.(done, videoIds.length, id);
        return { id, result };
      }),
    );

    for (const { id, result } of batchResults) {
      results.set(id, result);
    }
  }

  return results;
}
