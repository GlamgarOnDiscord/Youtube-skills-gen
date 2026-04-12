import type { VideoMetadata } from '../domain/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Metadata helpers — lightweight extraction from already-fetched VideoMetadata
// ─────────────────────────────────────────────────────────────────────────────

/** Format duration in seconds to HH:MM:SS or MM:SS */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Truncate a string to maxLen chars, appending "…" if needed */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/** Extract the most relevant parts of a video description for context */
export function summarizeDescription(description: string, maxChars = 400): string {
  if (!description) return '';
  // Keep first few paragraphs (most relevant)
  const clean = description.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return truncate(clean, maxChars);
}

/** Build a concise context header for each video in the corpus */
export function buildVideoContextHeader(video: VideoMetadata): string {
  const parts = [
    `Title: ${video.title}`,
    `Channel: ${video.channelName}`,
    `Duration: ${formatDuration(video.durationSeconds)}`,
    `Published: ${video.publishedAt ? new Date(video.publishedAt).toISOString().split('T')[0] : 'unknown'}`,
    `URL: ${video.url}`,
  ];

  if (video.description) {
    parts.push(`Description: ${summarizeDescription(video.description, 300)}`);
  }

  return parts.join('\n');
}

/** Sanitize a string for use as a directory/file name */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/** Get a safe output folder name from a YouTube source display name */
export function sourceToFolderName(displayName: string, suffix?: string): string {
  const base = slugify(displayName || 'youtube-skills');
  const ts = new Date().toISOString().split('T')[0];
  return suffix ? `${base}-${suffix}-${ts}` : `${base}-skills-${ts}`;
}
