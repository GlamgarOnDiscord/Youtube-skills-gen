import * as p from '@clack/prompts';
import { loadEnv } from '../../config/env.ts';
import { resolveSource, validateUrl } from '../../providers/youtube/resolver.ts';
import { getYouTubeClient } from '../../providers/youtube/client.ts';
import { resolveAndListVideos } from '../../providers/youtube/sources.ts';
import { fetchTranscriptsBatch } from '../../extractors/transcript.ts';
import { joinAndNormalizeSegments } from '../../normalizers/text.ts';
import { getCache } from '../../storage/cache.ts';
import { printBanner, printError, ok, warn, info, progressBar, hr } from '../ui/display.ts';
import type { VideoWithTranscript } from '../../domain/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// fetch command — pre-fetch and cache transcripts without generating skills
// ─────────────────────────────────────────────────────────────────────────────

export interface FetchCommandOptions {
  channel?: string;
  playlist?: string;
  video?: string[];
  maxVideos?: string;
  lang?: string;
  noCache?: boolean;
}

export async function runFetchCommand(opts: FetchCommandOptions): Promise<void> {
  let cfg;
  try {
    cfg = loadEnv();
  } catch (err: unknown) {
    printError('Configuration error', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  printBanner();

  const spinner = p.spinner();

  // ── Resolve source ─────────────────────────────────────────────────────────
  const url = opts.channel ?? opts.playlist ?? opts.video?.[0];
  if (!url) {
    printError('No input', 'Provide --channel, --playlist, or --video');
    process.exit(1);
  }

  const v = validateUrl(url);
  if (!v.valid) {
    printError('Invalid URL', v.reason ?? 'Bad URL');
    process.exit(1);
  }

  const source = resolveSource(url);

  // ── List videos ────────────────────────────────────────────────────────────
  spinner.start('Listing videos...');

  let videoIds: string[] = [];

  if (source.type === 'video') {
    videoIds = source.resolvedId ? [source.resolvedId] : [];
    if (opts.video && opts.video.length > 1) {
      for (const u of opts.video.slice(1)) {
        const s = resolveSource(u);
        if (s.resolvedId) videoIds.push(s.resolvedId);
      }
    }
  } else {
    if (!cfg.YOUTUBE_API_KEY) {
      spinner.stop('');
      printError(
        'Missing YouTube API key',
        'YOUTUBE_API_KEY is required to list channel/playlist videos.',
        'Add it to your .env file.',
      );
      process.exit(1);
    }

    const client = getYouTubeClient(cfg.YOUTUBE_API_KEY);
    const maxVideos = opts.maxVideos ? parseInt(opts.maxVideos) : cfg.MAX_VIDEOS;

    try {
      const { videos } = await resolveAndListVideos(client, source, {
        maxVideos: maxVideos || undefined,
      });
      videoIds = videos.map((v) => v.id);
    } catch (err) {
      spinner.stop('');
      printError('Failed to list videos', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  spinner.stop(ok(`Found ${videoIds.length} video(s)`));

  // ── Fetch transcripts ──────────────────────────────────────────────────────
  const cache = !opts.noCache ? getCache(cfg.CACHE_DIR, cfg.CACHE_TTL_HOURS) : null;
  await cache?.init();

  // Check cache hits
  const toFetch: string[] = [];
  const cachedCount = { count: 0 };

  for (const id of videoIds) {
    const cached = await cache?.getVideo(id);
    if (cached) {
      cachedCount.count++;
    } else {
      toFetch.push(id);
    }
  }

  if (toFetch.length === 0) {
    console.log(ok(`All ${videoIds.length} video(s) already cached`));
    return;
  }

  console.log(info(`Cache hits: ${cachedCount.count}, to fetch: ${toFetch.length}`));

  spinner.start(`Fetching ${toFetch.length} transcript(s)...`);
  let done = 0;

  const results = await fetchTranscriptsBatch(
    toFetch,
    opts.lang ?? cfg.TRANSCRIPT_LANG,
    3,
    (fetched, total) => {
      done = fetched;
      spinner.message(
        `Fetching transcripts: ${progressBar(done, total)}`,
      );
    },
  );

  spinner.stop(ok(`Fetched ${done} transcript(s)`));

  // ── Cache results ──────────────────────────────────────────────────────────
  let successCount = 0;
  let skipCount = 0;

  for (const [id, result] of results) {
    if (result.success) {
      const transcript = joinAndNormalizeSegments(result.data.segments);
      const video: VideoWithTranscript = {
        id,
        title: id,
        description: '',
        channelId: '',
        channelName: source.displayName ?? '',
        publishedAt: '',
        durationSeconds: 0,
        thumbnailUrl: '',
        url: `https://www.youtube.com/watch?v=${id}`,
        transcript,
        transcriptRaw: result.data.raw,
        segments: result.data.segments,
        language: result.data.language,
      };
      await cache?.setVideo(video);
      successCount++;
    } else {
      skipCount++;
      console.log(warn(`No transcript: ${id} (${result.message})`));
    }
  }

  console.log('');
  console.log(hr());
  console.log(ok(`Cached: ${successCount} transcript(s)`));
  if (skipCount > 0) console.log(warn(`Skipped: ${skipCount} (no transcript)`));
  console.log('');
}
