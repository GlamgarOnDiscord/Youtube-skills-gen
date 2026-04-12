import type { YouTubeClient } from './client.ts';
import { withRetry, resolveChannelId } from './client.ts';
import type { VideoMetadata, YouTubeSource } from '../../domain/index.ts';
import { YouTubeError } from '../../domain/index.ts';
import logger from '../../logging/logger.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Video listing: channel, playlist, single video
// ─────────────────────────────────────────────────────────────────────────────

interface ListOptions {
  maxVideos?: number;
  orderBy?: 'date' | 'viewCount' | 'relevance';
}

/** ISO 8601 duration → seconds  (e.g. "PT1H2M3S" → 3723) */
function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? '0') * 3600) + (parseInt(m[2] ?? '0') * 60) + parseInt(m[3] ?? '0');
}

/** Enrich a list of video IDs with full metadata in batches of 50 */
async function enrichVideos(
  client: YouTubeClient,
  videoIds: string[],
): Promise<VideoMetadata[]> {
  const results: VideoMetadata[] = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const res = await withRetry(
      () =>
        client.videos.list({
          part: ['snippet', 'contentDetails', 'statistics'],
          id: batch,
          maxResults: 50,
        }),
      `videos.list(batch=${i / 50})`,
    );

    for (const item of res.data.items ?? []) {
      const snippet = item.snippet;
      const contentDetails = item.contentDetails;
      const stats = item.statistics;
      if (!item.id || !snippet) continue;

      results.push({
        id: item.id,
        title: snippet.title ?? 'Untitled',
        description: snippet.description ?? '',
        channelId: snippet.channelId ?? '',
        channelName: snippet.channelTitle ?? '',
        publishedAt: snippet.publishedAt ?? '',
        durationSeconds: parseDuration(contentDetails?.duration ?? ''),
        thumbnailUrl:
          snippet.thumbnails?.maxres?.url ??
          snippet.thumbnails?.high?.url ??
          snippet.thumbnails?.default?.url ??
          '',
        url: `https://www.youtube.com/watch?v=${item.id}`,
        viewCount: stats?.viewCount ? parseInt(stats.viewCount) : undefined,
        tags: snippet.tags ?? [],
      });
    }
  }

  return results;
}

/** List all video IDs from a channel */
async function listChannelVideoIds(
  client: YouTubeClient,
  channelId: string,
  opts: ListOptions = {},
): Promise<string[]> {
  const { maxVideos = 0 } = opts;
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await withRetry(
      () =>
        client.search.list({
          part: ['id'],
          channelId,
          type: ['video'],
          maxResults: 50,
          order: opts.orderBy ?? 'date',
          pageToken,
        }),
      `search.list(channelId=${channelId})`,
    );

    for (const item of res.data.items ?? []) {
      if (item.id?.videoId) ids.push(item.id.videoId);
    }

    pageToken = res.data.nextPageToken ?? undefined;

    if (maxVideos > 0 && ids.length >= maxVideos) break;
  } while (pageToken);

  return maxVideos > 0 ? ids.slice(0, maxVideos) : ids;
}

/** List all video IDs from a playlist */
async function listPlaylistVideoIds(
  client: YouTubeClient,
  playlistId: string,
  opts: ListOptions = {},
): Promise<string[]> {
  const { maxVideos = 0 } = opts;
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await withRetry(
      () =>
        client.playlistItems.list({
          part: ['contentDetails'],
          playlistId,
          maxResults: 50,
          pageToken,
        }),
      `playlistItems.list(playlistId=${playlistId})`,
    );

    for (const item of res.data.items ?? []) {
      const vid = item.contentDetails?.videoId;
      if (vid) ids.push(vid);
    }

    pageToken = res.data.nextPageToken ?? undefined;

    if (maxVideos > 0 && ids.length >= maxVideos) break;
  } while (pageToken);

  return maxVideos > 0 ? ids.slice(0, maxVideos) : ids;
}

/** Get playlist metadata */
async function getPlaylistMeta(
  client: YouTubeClient,
  playlistId: string,
): Promise<{ title: string; channelName: string }> {
  const res = await withRetry(
    () =>
      client.playlists.list({
        part: ['snippet'],
        id: [playlistId],
        maxResults: 1,
      }),
    `playlists.list(id=${playlistId})`,
  );
  const item = res.data.items?.[0];
  return {
    title: item?.snippet?.title ?? playlistId,
    channelName: item?.snippet?.channelTitle ?? '',
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface ResolvedSource {
  source: YouTubeSource;
  videos: VideoMetadata[];
}

export async function resolveAndListVideos(
  client: YouTubeClient,
  source: YouTubeSource,
  opts: ListOptions = {},
): Promise<ResolvedSource> {
  let videoIds: string[] = [];
  let resolvedSource = { ...source };

  switch (source.type) {
    case 'channel': {
      // Resolve channel ID if not already known
      const channelInput =
        source.resolvedId ??
        (source.originalUrl.match(/\/@([^/?]+)/)?.[1]
          ? `@${source.originalUrl.match(/\/@([^/?]+)/)?.[1]}`
          : source.originalUrl.match(/\/(?:c|user)\/([^/?]+)/)?.[1] ?? source.originalUrl);

      logger.debug(`Resolving channel: ${channelInput}`);
      const { id, title } = await resolveChannelId(client, channelInput);
      resolvedSource = { ...source, resolvedId: id, displayName: title };

      logger.debug(`Listing videos for channel ${id}...`);
      videoIds = await listChannelVideoIds(client, id, opts);
      logger.info(`Channel "${title}": found ${videoIds.length} video IDs`);
      break;
    }

    case 'playlist': {
      if (!source.resolvedId) {
        throw new YouTubeError('Playlist ID could not be resolved', 'MISSING_PLAYLIST_ID');
      }
      const meta = await getPlaylistMeta(client, source.resolvedId);
      resolvedSource = {
        ...source,
        displayName: meta.title,
      };

      videoIds = await listPlaylistVideoIds(client, source.resolvedId, opts);
      logger.info(`Playlist "${meta.title}": found ${videoIds.length} video IDs`);
      break;
    }

    case 'video': {
      if (!source.resolvedId) {
        throw new YouTubeError('Video ID could not be resolved', 'MISSING_VIDEO_ID');
      }
      videoIds = [source.resolvedId];
      break;
    }

    case 'manual': {
      // resolvedId is a comma-separated list of video IDs set by caller
      videoIds = source.resolvedId?.split(',').filter(Boolean) ?? [];
      break;
    }
  }

  if (videoIds.length === 0) {
    throw new YouTubeError(
      `No videos found for source: ${source.originalUrl}`,
      'NO_VIDEOS',
    );
  }

  logger.debug(`Enriching ${videoIds.length} videos with metadata...`);
  const videos = await enrichVideos(client, videoIds);

  return { source: resolvedSource, videos };
}

/** Deduplicate video list by ID */
export function deduplicateVideos(videos: VideoMetadata[]): VideoMetadata[] {
  const seen = new Set<string>();
  return videos.filter((v) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });
}
