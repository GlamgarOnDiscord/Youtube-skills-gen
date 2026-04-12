import { join } from 'node:path';
import type {
  PipelineOptions,
  PipelineResult,
  ProgressCallback,
  VideoWithTranscript,
  YouTubeSource,
} from '../domain/index.ts';
import { YouTubeError } from '../domain/index.ts';
import { env } from '../config/env.ts';
import { getCache } from '../storage/cache.ts';
import { getYouTubeClient } from '../providers/youtube/client.ts';
import { resolveAndListVideos } from '../providers/youtube/sources.ts';
import { fetchTranscriptsBatch } from '../extractors/transcript.ts';
import { joinAndNormalizeSegments } from '../normalizers/text.ts';
import {
  deduplicateByTranscript,
  filterByTranscriptLength,
} from '../normalizers/dedup.ts';
import { buildCorpus } from '../chunkers/corpus.ts';
import { generateSkillsFromCorpus } from '../skill-generator/generator.ts';
import { writeSkills, buildOutputDirName } from '../skill-generator/writer.ts';
import logger from '../logging/logger.ts';
import {
  MIN_TRANSCRIPT_CHARS,
  FETCH_CONCURRENCY,
} from '../config/defaults.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline orchestrator — full end-to-end flow
// ─────────────────────────────────────────────────────────────────────────────

const startTimer = () => {
  const t = Date.now();
  return () => Date.now() - t;
};

export async function runPipeline(
  options: PipelineOptions,
  onProgress?: ProgressCallback,
): Promise<PipelineResult> {
  const elapsed = startTimer();
  const cfg = env();
  const errors: string[] = [];

  const sources = Array.isArray(options.source) ? options.source : [options.source];
  const useCache = options.useCache ?? true;
  const skipNoTranscript = options.skipNoTranscript ?? cfg.SKIP_NO_TRANSCRIPT;
  const transcriptLang = options.transcriptLang ?? cfg.TRANSCRIPT_LANG;
  const maxVideos = options.maxVideos ?? cfg.MAX_VIDEOS;
  const maxSkills = options.maxSkills ?? cfg.MAX_SKILLS;

  // ── Phase 1: Resolve & list videos ─────────────────────────────────────────
  onProgress?.({ phase: 'resolving', message: 'Resolving input sources...' });

  let allVideos: VideoWithTranscript[] = [];
  let resolvedSource: YouTubeSource | null = null;

  for (const source of sources) {
    try {
      if (source.type === 'manual') {
        // Manual mode: resolvedId is a comma-separated list of video IDs
        const ids = source.resolvedId?.split(',').filter(Boolean) ?? [];
        if (ids.length === 0) {
          errors.push(`No video IDs provided for manual source`);
          continue;
        }
        // Will be handled in transcript fetch phase
        onProgress?.({ phase: 'listing', total: ids.length, message: `${ids.length} video(s) queued` });
        resolvedSource = source;

        // Create minimal VideoWithTranscript stubs; metadata will be filled from cache or skipped
        for (const id of ids) {
          allVideos.push(createStubVideo(id, source));
        }
      } else {
        const requiresApiKey = source.type === 'channel' || source.type === 'playlist';
        if (requiresApiKey && !cfg.YOUTUBE_API_KEY) {
          throw new YouTubeError(
            `YouTube API key (YOUTUBE_API_KEY) is required to process ${source.type}s. ` +
            `Get one at https://console.cloud.google.com/apis/api/youtube.googleapis.com`,
            'MISSING_API_KEY',
          );
        }

        const client = getYouTubeClient(cfg.YOUTUBE_API_KEY!);
        onProgress?.({ phase: 'listing', message: `Listing videos from ${source.type}...` });

        const { source: resolved, videos } = await resolveAndListVideos(
          client,
          source,
          { maxVideos: maxVideos || undefined },
        );

        resolvedSource ??= resolved;

        // Convert VideoMetadata → VideoWithTranscript stubs
        const stubs = videos.map((v) => createStubVideoFromMetadata(v));
        allVideos.push(...stubs);

        onProgress?.({ phase: 'listing', total: videos.length, message: `Found ${videos.length} video(s)` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      logger.error(`Source resolution failed: ${msg}`);
    }
  }

  if (allVideos.length === 0) {
    return {
      success: false,
      videosProcessed: 0,
      videosWithTranscripts: 0,
      videosSkipped: 0,
      skillsGenerated: 0,
      outputPaths: [],
      durationMs: elapsed(),
      errors,
    };
  }

  // Deduplicate by video ID across sources
  const uniqueIds = new Set<string>();
  allVideos = allVideos.filter((v) => {
    if (uniqueIds.has(v.id)) return false;
    uniqueIds.add(v.id);
    return true;
  });

  // Apply maxVideos limit
  if (maxVideos > 0 && allVideos.length > maxVideos) {
    allVideos = allVideos.slice(0, maxVideos);
  }

  // ── Phase 2: Fetch transcripts ──────────────────────────────────────────────
  onProgress?.({ phase: 'extracting', total: allVideos.length, current: 0, message: 'Fetching transcripts...' });

  const cache = useCache ? getCache(cfg.CACHE_DIR, cfg.CACHE_TTL_HOURS) : null;
  await cache?.init();

  const videosToFetch: string[] = [];
  const videosFromCache: VideoWithTranscript[] = [];

  // Check cache first
  for (const video of allVideos) {
    if (cache) {
      const cached = await cache.getVideo(video.id);
      if (cached) {
        videosFromCache.push(cached);
        continue;
      }
    }
    videosToFetch.push(video.id);
  }

  logger.info(
    `Cache: ${videosFromCache.length} hit(s), ${videosToFetch.length} to fetch`,
  );

  let fetchDone = videosFromCache.length;
  const transcriptResults = await fetchTranscriptsBatch(
    videosToFetch,
    transcriptLang,
    FETCH_CONCURRENCY,
    (done, total, videoId) => {
      fetchDone = videosFromCache.length + done;
      onProgress?.({
        phase: 'extracting',
        current: fetchDone,
        total: allVideos.length,
        message: `Fetching transcript for ${videoId}`,
      });
    },
  );

  // ── Phase 3: Assemble complete videos ─────────────────────────────────────
  onProgress?.({ phase: 'normalizing', message: 'Normalizing transcripts...' });

  const completeVideos: VideoWithTranscript[] = [...videosFromCache];
  let skippedCount = 0;

  for (const video of allVideos) {
    // Skip if already loaded from cache
    if (videosFromCache.some((v) => v.id === video.id)) continue;

    const result = transcriptResults.get(video.id);
    if (!result) continue;

    if (!result.success) {
      if (skipNoTranscript) {
        skippedCount++;
        logger.debug(`Skipping ${video.id}: ${result.message}`);
      } else {
        // Include with empty transcript — still useful for metadata
        completeVideos.push({ ...video, transcript: '' } as VideoWithTranscript);
      }
      continue;
    }

    const transcript = joinAndNormalizeSegments(result.data.segments);
    const complete: VideoWithTranscript = {
      ...video,
      transcript,
      transcriptRaw: result.data.raw,
      segments: result.data.segments,
      language: result.data.language,
    };

    // Cache for next time
    await cache?.setVideo(complete);
    completeVideos.push(complete);
  }

  // Filter out videos with very short transcripts
  const validVideos = filterByTranscriptLength(
    completeVideos.filter((v) => v.transcript.length > 0),
    MIN_TRANSCRIPT_CHARS,
  );

  // Content-based deduplication
  const { videos: dedupedVideos, removedCount } = deduplicateByTranscript(validVideos);
  if (removedCount > 0) {
    logger.info(`Removed ${removedCount} near-duplicate video(s)`);
  }

  if (dedupedVideos.length === 0) {
    return {
      success: false,
      videosProcessed: allVideos.length,
      videosWithTranscripts: 0,
      videosSkipped: skippedCount,
      skillsGenerated: 0,
      outputPaths: [],
      durationMs: elapsed(),
      errors: [...errors, 'No videos with usable transcripts found'],
    };
  }

  logger.info(`Processing ${dedupedVideos.length} videos with transcripts`);

  // If dry run, stop here
  if (options.dryRun) {
    return {
      success: true,
      videosProcessed: allVideos.length,
      videosWithTranscripts: dedupedVideos.length,
      videosSkipped: skippedCount,
      skillsGenerated: 0,
      outputPaths: [],
      durationMs: elapsed(),
      errors,
    };
  }

  // ── Phase 4: Build corpus ──────────────────────────────────────────────────
  const effectiveSource = resolvedSource ?? sources[0];
  const corpus = buildCorpus(dedupedVideos, effectiveSource);
  logger.info(`Corpus: ${corpus.videos.length} videos, ~${Math.round(corpus.totalTokens / 1000)}K tokens`);

  // ── Phase 5: Analyze + generate skills ────────────────────────────────────
  onProgress?.({ phase: 'analyzing', message: 'Sending corpus to Gemini...' });

  const { skills } = await generateSkillsFromCorpus(
    corpus,
    {
      geminiApiKey: cfg.GEMINI_API_KEY,
      analysisModel: options.geminiAnalysisModel ?? cfg.GEMINI_ANALYSIS_MODEL,
      generationModel: options.geminiGenerationModel ?? cfg.GEMINI_GENERATION_MODEL,
      temperature: cfg.GEMINI_TEMPERATURE,
      maxOutputTokens: cfg.GEMINI_MAX_OUTPUT_TOKENS,
      maxSkills,
    },
    (phase, detail) => {
      if (phase === 'analyzing') onProgress?.({ phase: 'analyzing', message: detail });
      if (phase === 'generating') onProgress?.({ phase: 'generating', message: detail });
    },
  );

  if (skills.length === 0) {
    return {
      success: false,
      videosProcessed: allVideos.length,
      videosWithTranscripts: dedupedVideos.length,
      videosSkipped: skippedCount,
      skillsGenerated: 0,
      outputPaths: [],
      durationMs: elapsed(),
      errors: [...errors, 'No skills were generated'],
    };
  }

  // ── Phase 6: Write output ───────────────────────────────────────────────────
  onProgress?.({ phase: 'writing', message: 'Writing skill files...' });

  const dirName = buildOutputDirName(effectiveSource);
  const outputDir = join(options.outputDir, dirName);

  const { skillPaths, manifestPath } = await writeSkills(skills, outputDir, effectiveSource, {
    videosProcessed: allVideos.length,
    videosWithTranscripts: dedupedVideos.length,
  });

  logger.info(`Output written to: ${outputDir}`);

  return {
    success: true,
    videosProcessed: allVideos.length,
    videosWithTranscripts: dedupedVideos.length,
    videosSkipped: skippedCount,
    skillsGenerated: skills.length,
    outputPaths: skillPaths,
    manifestPath,
    durationMs: elapsed(),
    errors,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function createStubVideo(videoId: string, source: YouTubeSource): VideoWithTranscript {
  return {
    id: videoId,
    title: videoId,
    description: '',
    channelId: '',
    channelName: source.displayName ?? '',
    publishedAt: '',
    durationSeconds: 0,
    thumbnailUrl: '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    transcript: '',
  };
}

function createStubVideoFromMetadata(
  video: import('../domain/index.ts').VideoMetadata,
): VideoWithTranscript {
  return {
    ...video,
    transcript: '',
  };
}
