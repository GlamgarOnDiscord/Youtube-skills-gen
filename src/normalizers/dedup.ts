import type { VideoWithTranscript } from '../domain/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Deduplication — remove semantically redundant videos from corpus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simple shingling-based similarity for near-duplicate detection.
 * Uses character 4-grams (shingles) and Jaccard similarity.
 */
function buildShingles(text: string, n = 4): Set<string> {
  const shingles = new Set<string>();
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  for (let i = 0; i <= normalized.length - n; i++) {
    shingles.add(normalized.slice(i, i + n));
  }
  return shingles;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const s of a) {
    if (b.has(s)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}

export interface DedupOptions {
  /**
   * Jaccard similarity threshold above which two videos are considered duplicates.
   * 0.8 = very similar (near-dupes), 0.5 = somewhat similar.
   */
  threshold?: number;
  /** Only sample the first N chars of each transcript for shingle computation */
  sampleChars?: number;
}

/**
 * Remove near-duplicate videos from a list.
 * Keeps the first occurrence in case of duplication.
 * O(n²) — fine for typical channel sizes (< 500 videos).
 */
export function deduplicateByTranscript(
  videos: VideoWithTranscript[],
  opts: DedupOptions = {},
): { videos: VideoWithTranscript[]; removedCount: number; removedIds: string[] } {
  const { threshold = 0.85, sampleChars = 3000 } = opts;

  const shingleCache = new Map<string, Set<string>>();
  const kept: VideoWithTranscript[] = [];
  const removedIds: string[] = [];

  for (const video of videos) {
    const sample = video.transcript.slice(0, sampleChars);
    const shingles = buildShingles(sample);
    shingleCache.set(video.id, shingles);

    let isDuplicate = false;
    for (const keptVideo of kept) {
      const keptShingles = shingleCache.get(keptVideo.id)!;
      const sim = jaccardSimilarity(shingles, keptShingles);
      if (sim >= threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (isDuplicate) {
      removedIds.push(video.id);
    } else {
      kept.push(video);
    }
  }

  return { videos: kept, removedCount: removedIds.length, removedIds };
}

/** Remove videos shorter than minDurationSeconds */
export function filterByDuration(
  videos: VideoWithTranscript[],
  minDurationSeconds: number,
): VideoWithTranscript[] {
  return videos.filter((v) => v.durationSeconds >= minDurationSeconds);
}

/** Remove videos with transcripts shorter than minChars */
export function filterByTranscriptLength(
  videos: VideoWithTranscript[],
  minChars: number,
): VideoWithTranscript[] {
  return videos.filter((v) => v.transcript.length >= minChars);
}
