import { google } from 'googleapis';
import type { youtube_v3 } from 'googleapis';
import { YouTubeError } from '../../domain/index.ts';
import { API_REQUEST_DELAY_MS, MAX_RETRIES, RETRY_DELAY_BASE_MS } from '../../config/defaults.ts';
import logger from '../../logging/logger.ts';

// ─────────────────────────────────────────────────────────────────────────────
// YouTube Data API v3 wrapper with retry logic
// ─────────────────────────────────────────────────────────────────────────────

export type YouTubeClient = youtube_v3.Youtube;

let _client: YouTubeClient | null = null;

export function getYouTubeClient(apiKey: string): YouTubeClient {
  if (_client) return _client;
  _client = google.youtube({ version: 'v3', auth: apiKey });
  return _client;
}

/** Small delay helper */
async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Generic retry wrapper for YouTube API calls */
export async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
): Promise<T> {
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1);
        logger.debug(`Retry ${attempt}/${MAX_RETRIES} for ${context} (delay ${delay}ms)`);
        await sleep(delay);
      }
      const result = await fn();
      await sleep(API_REQUEST_DELAY_MS); // rate limit guard
      return result;
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err : new Error(String(err));

      const code = (err as { code?: number })?.code;
      // Don't retry 4xx client errors
      if (code && code >= 400 && code < 500 && code !== 429) {
        break;
      }

      logger.debug(`Error in ${context}: ${lastErr.message}`);
    }
  }

  throw new YouTubeError(
    `YouTube API error in ${context}: ${lastErr?.message ?? 'unknown error'}`,
    'API_ERROR',
  );
}

/** Resolve a channel handle/username/URL to a channel ID */
export async function resolveChannelId(
  client: YouTubeClient,
  input: string,
): Promise<{ id: string; title: string }> {
  // Already a channel ID (starts with UC + 22 chars)
  if (/^UC[\w-]{22}$/.test(input)) {
    const res = await withRetry(
      () =>
        client.channels.list({
          part: ['snippet'],
          id: [input],
          maxResults: 1,
        }),
      `channels.list(id=${input})`,
    );
    const item = res.data.items?.[0];
    if (!item?.id) throw new YouTubeError(`Channel not found: ${input}`);
    return { id: item.id, title: item.snippet?.title ?? input };
  }

  // Handle (@name) or legacy username
  const handle = input.startsWith('@') ? input.slice(1) : input;

  // Try forHandle first (YouTube API v3 supports this for new handles)
  try {
    const res = await withRetry(
      () =>
        client.channels.list({
          part: ['id', 'snippet'],
          forHandle: handle,
          maxResults: 1,
        }),
      `channels.list(forHandle=${handle})`,
    );
    const item = res.data.items?.[0];
    if (item?.id) {
      return { id: item.id, title: item.snippet?.title ?? handle };
    }
  } catch {
    // fall through to forUsername
  }

  // Legacy username
  const res = await withRetry(
    () =>
      client.channels.list({
        part: ['id', 'snippet'],
        forUsername: handle,
        maxResults: 1,
      }),
    `channels.list(forUsername=${handle})`,
  );
  const item = res.data.items?.[0];
  if (!item?.id) {
    throw new YouTubeError(
      `Could not resolve channel "${input}". Make sure the handle or username is correct and the YouTube API key is valid.`,
      'CHANNEL_NOT_FOUND',
    );
  }
  return { id: item.id, title: item.snippet?.title ?? handle };
}
