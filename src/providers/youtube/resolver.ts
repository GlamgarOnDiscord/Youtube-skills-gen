import type { YouTubeSource, YouTubeSourceType } from '../../domain/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// URL resolver — detects YouTube source type from any URL format
// ─────────────────────────────────────────────────────────────────────────────

const YT_DOMAINS = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com'];

export function isYouTubeUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return YT_DOMAINS.some((d) => url.hostname === d);
  } catch {
    return false;
  }
}

export function validateUrl(input: string): { valid: boolean; reason?: string } {
  if (!input.trim()) return { valid: false, reason: 'URL cannot be empty' };

  try {
    new URL(input);
  } catch {
    return { valid: false, reason: `"${input}" is not a valid URL` };
  }

  if (!isYouTubeUrl(input)) {
    return { valid: false, reason: `"${input}" does not appear to be a YouTube URL` };
  }

  return { valid: true };
}

export function resolveSource(rawUrl: string): YouTubeSource {
  const url = new URL(rawUrl);
  const { hostname, pathname, searchParams } = url;

  // ── youtu.be/VIDEO_ID ──────────────────────────────────────────────────────
  if (hostname === 'youtu.be') {
    const videoId = pathname.slice(1).split('?')[0];
    return {
      type: 'video',
      originalUrl: rawUrl,
      resolvedId: videoId || undefined,
    };
  }

  // ── Playlist URL (may also include a video, but we treat as playlist) ───────
  const listId = searchParams.get('list');
  if (listId && !pathname.includes('/channel/') && !pathname.startsWith('/@')) {
    // playlist?list=PLxxx or watch?v=xxx&list=PLxxx
    return {
      type: 'playlist',
      originalUrl: rawUrl,
      resolvedId: listId,
    };
  }

  // ── Channel URLs ──────────────────────────────────────────────────────────
  // /channel/CHANNEL_ID
  const channelMatch = pathname.match(/^\/channel\/([^/]+)/);
  if (channelMatch) {
    return {
      type: 'channel',
      originalUrl: rawUrl,
      resolvedId: channelMatch[1],
    };
  }

  // /@handle
  const handleMatch = pathname.match(/^\/@([^/]+)/);
  if (handleMatch) {
    return {
      type: 'channel',
      originalUrl: rawUrl,
      // resolvedId will be looked up via API (handle → channel ID)
      displayName: `@${handleMatch[1]}`,
    };
  }

  // /c/customname or /user/username (legacy)
  const legacyMatch = pathname.match(/^\/(c|user)\/([^/]+)/);
  if (legacyMatch) {
    return {
      type: 'channel',
      originalUrl: rawUrl,
      displayName: legacyMatch[2],
    };
  }

  // ── Single video: /watch?v=VIDEO_ID ───────────────────────────────────────
  const videoId = searchParams.get('v');
  if (videoId) {
    return {
      type: 'video',
      originalUrl: rawUrl,
      resolvedId: videoId,
    };
  }

  // Fallback — treat as channel home page
  return {
    type: 'channel',
    originalUrl: rawUrl,
  };
}

/** Extract a video ID from various URL forms, or return the string as-is if it looks like a raw ID */
export function extractVideoId(input: string): string | null {
  if (!input) return null;

  // Raw ID (11 chars, alphanumeric + _ -)
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) {
    return input.trim();
  }

  try {
    const url = new URL(input);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('?')[0] || null;
    return url.searchParams.get('v');
  } catch {
    return null;
  }
}

/** Detect source type from a URL, without full resolution */
export function detectSourceType(url: string): YouTubeSourceType {
  try {
    return resolveSource(url).type;
  } catch {
    return 'manual';
  }
}
