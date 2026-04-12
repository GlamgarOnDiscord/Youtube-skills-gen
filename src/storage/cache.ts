import { mkdir, readFile, writeFile, stat, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { VideoWithTranscript } from '../domain/index.ts';
import logger from '../logging/logger.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Disk cache — stores transcripts and metadata to avoid redundant API calls
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  cachedAt: string;
  expiresAt: string;
}

export class DiskCache {
  private readonly dir: string;
  private readonly ttlMs: number;

  constructor(cacheDir: string, ttlHours: number) {
    this.dir = cacheDir;
    this.ttlMs = ttlHours * 3600 * 1000;
  }

  private videoPath(videoId: string): string {
    return join(this.dir, 'videos', `${videoId}.json`);
  }

  async init(): Promise<void> {
    await mkdir(join(this.dir, 'videos'), { recursive: true });
  }

  async getVideo(videoId: string): Promise<VideoWithTranscript | null> {
    try {
      const path = this.videoPath(videoId);
      const raw = await readFile(path, 'utf-8');
      const entry = JSON.parse(raw) as CacheEntry<VideoWithTranscript>;

      // Check TTL (ttlMs = 0 means never expire)
      if (this.ttlMs > 0) {
        const expiresAt = new Date(entry.expiresAt).getTime();
        if (Date.now() > expiresAt) {
          logger.debug(`Cache expired for video ${videoId}`);
          return null;
        }
      }

      return entry.data;
    } catch {
      return null;
    }
  }

  async setVideo(video: VideoWithTranscript): Promise<void> {
    try {
      await this.init();
      const path = this.videoPath(video.id);
      const now = new Date();
      const entry: CacheEntry<VideoWithTranscript> = {
        data: video,
        cachedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
      };
      await writeFile(path, JSON.stringify(entry, null, 2), 'utf-8');
    } catch (err) {
      logger.warn(`Failed to cache video ${video.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async getStats(): Promise<{ count: number; sizeBytes: number; oldestEntry?: string }> {
    try {
      const dir = join(this.dir, 'videos');
      const files = await readdir(dir);
      let totalSize = 0;
      let oldest: string | undefined;

      for (const file of files) {
        try {
          const s = await stat(join(dir, file));
          totalSize += s.size;
          if (!oldest || s.mtime.toISOString() < oldest) {
            oldest = s.mtime.toISOString();
          }
        } catch { /* skip */ }
      }

      return { count: files.length, sizeBytes: totalSize, oldestEntry: oldest };
    } catch {
      return { count: 0, sizeBytes: 0 };
    }
  }

  async listCachedVideoIds(): Promise<string[]> {
    try {
      const dir = join(this.dir, 'videos');
      const files = await readdir(dir);
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));
    } catch {
      return [];
    }
  }

  async clear(): Promise<number> {
    try {
      const dir = join(this.dir, 'videos');
      const files = await readdir(dir);
      let count = 0;
      for (const file of files) {
        try {
          await rm(join(dir, file));
          count++;
        } catch { /* skip */ }
      }
      return count;
    } catch {
      return 0;
    }
  }

  async clearExpired(): Promise<number> {
    if (this.ttlMs === 0) return 0; // never expire

    let count = 0;
    const ids = await this.listCachedVideoIds();
    for (const id of ids) {
      const video = await this.getVideo(id); // null if expired
      if (!video) {
        try {
          await rm(this.videoPath(id));
          count++;
        } catch { /* skip */ }
      }
    }
    return count;
  }
}

/** Singleton factory — one cache instance per process */
let _cache: DiskCache | null = null;

export function getCache(cacheDir: string, ttlHours: number): DiskCache {
  if (!_cache) {
    _cache = new DiskCache(cacheDir, ttlHours);
  }
  return _cache;
}
