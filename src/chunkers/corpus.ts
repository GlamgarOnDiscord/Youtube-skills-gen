import type { CorpusVideo, CorpusChunk, VideoWithTranscript, YouTubeSource } from '../domain/index.ts';
import type { Corpus } from '../domain/index.ts';
import { estimateTokens } from '../normalizers/text.ts';
import { MAX_ANALYSIS_TOKENS, MAX_GENERATION_TOKENS } from '../config/defaults.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Corpus builder — assembles videos into a Corpus and splits into LLM chunks
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a VideoWithTranscript into a leaner CorpusVideo */
export function toCorpusVideo(video: VideoWithTranscript): CorpusVideo {
  return {
    id: video.id,
    title: video.title,
    channelName: video.channelName,
    url: video.url,
    publishedAt: video.publishedAt,
    durationSeconds: video.durationSeconds,
    transcript: video.transcript,
    estimatedTokens: estimateTokens(video.transcript),
  };
}

/** Build a Corpus from a list of processed videos */
export function buildCorpus(
  videos: VideoWithTranscript[],
  source: YouTubeSource,
): Corpus {
  const corpusVideos = videos.map(toCorpusVideo);
  const totalTokens = corpusVideos.reduce((acc, v) => acc + v.estimatedTokens, 0);

  return {
    source,
    videos: corpusVideos,
    totalTokens,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Split a corpus into chunks that fit within the LLM token budget.
 * Uses a greedy bin-packing approach.
 */
export function chunkCorpus(
  corpus: Corpus,
  maxTokensPerChunk: number = MAX_ANALYSIS_TOKENS,
): CorpusChunk[] {
  const chunks: CorpusChunk[] = [];
  let current: CorpusVideo[] = [];
  let currentTokens = 0;

  for (const video of corpus.videos) {
    const tokens = video.estimatedTokens;

    if (tokens > maxTokensPerChunk) {
      // Truncate to fit
      const maxChars = maxTokensPerChunk * 4;
      const truncated: CorpusVideo = {
        ...video,
        transcript: video.transcript.slice(0, maxChars),
        estimatedTokens: maxTokensPerChunk,
      };

      if (current.length > 0) {
        chunks.push({
          videos: current,
          totalTokens: currentTokens,
          chunkIndex: chunks.length,
          totalChunks: 0,
        });
        current = [];
        currentTokens = 0;
      }

      chunks.push({
        videos: [truncated],
        totalTokens: maxTokensPerChunk,
        chunkIndex: chunks.length,
        totalChunks: 0,
      });
      continue;
    }

    if (currentTokens + tokens > maxTokensPerChunk && current.length > 0) {
      chunks.push({
        videos: current,
        totalTokens: currentTokens,
        chunkIndex: chunks.length,
        totalChunks: 0,
      });
      current = [];
      currentTokens = 0;
    }

    current.push(video);
    currentTokens += tokens;
  }

  if (current.length > 0) {
    chunks.push({
      videos: current,
      totalTokens: currentTokens,
      chunkIndex: chunks.length,
      totalChunks: 0,
    });
  }

  // Set totalChunks on all entries
  return chunks.map((c) => ({ ...c, totalChunks: chunks.length }));
}

/**
 * Render a chunk as a formatted string ready to be inserted into a Gemini prompt.
 */
export function renderChunkForPrompt(chunk: CorpusChunk): string {
  const parts: string[] = [];

  for (const video of chunk.videos) {
    parts.push(
      `\n${'─'.repeat(60)}\nVIDEO_ID: ${video.id}\nTitle: ${video.title}\nChannel: ${video.channelName}\nURL: ${video.url}\nDuration: ${Math.round(video.durationSeconds / 60)}min\n\nTRANSCRIPT:\n${video.transcript}\n`,
    );
  }

  return parts.join('\n');
}

/**
 * Build a minimal "index" string listing all videos with titles.
 */
export function buildVideoIndex(videos: CorpusVideo[]): string {
  return videos
    .map(
      (v, i) =>
        `${String(i + 1).padStart(3)}. [${v.id}] ${v.title} (${Math.round(v.durationSeconds / 60)}min)`,
    )
    .join('\n');
}

/**
 * Filter corpus videos to only those belonging to a skill cluster.
 * Ensures the resulting set fits within the generation token budget.
 */
export function filterCorpusForCluster(
  corpus: Corpus,
  videoIds: string[],
  maxTokens: number = MAX_GENERATION_TOKENS,
): CorpusVideo[] {
  const idSet = new Set(videoIds);
  const filtered = corpus.videos.filter((v) => idSet.has(v.id));

  let totalTokens = 0;
  const result: CorpusVideo[] = [];

  for (const video of filtered) {
    if (totalTokens + video.estimatedTokens > maxTokens) {
      const remaining = maxTokens - totalTokens;
      if (remaining > 1000) {
        result.push({
          ...video,
          transcript: video.transcript.slice(0, remaining * 4),
          estimatedTokens: remaining,
        });
      }
      break;
    }
    result.push(video);
    totalTokens += video.estimatedTokens;
  }

  return result;
}
