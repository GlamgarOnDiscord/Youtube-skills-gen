// ─────────────────────────────────────────────────────────────────────────────
// Pipeline & chunking defaults
// ─────────────────────────────────────────────────────────────────────────────

/** Rough chars-per-token ratio for estimation */
export const CHARS_PER_TOKEN = 4;

/**
 * Maximum input tokens to send to Gemini per analysis call.
 * Gemini 1.5 Pro supports 1M, but we stay well under to leave room for the prompt.
 */
export const MAX_ANALYSIS_TOKENS = 800_000;

/**
 * Maximum input tokens per skill generation call.
 * We reserve tokens for the prompt template + output.
 */
export const MAX_GENERATION_TOKENS = 500_000;

/** Maximum characters per transcript segment (for chunking) */
export const MAX_CHUNK_CHARS = MAX_ANALYSIS_TOKENS * CHARS_PER_TOKEN;

/** Maximum number of skill clusters the analyzer may return */
export const MAX_CLUSTERS = 6;

/** Minimum transcript length (chars) to include a video in the corpus */
export const MIN_TRANSCRIPT_CHARS = 200;

/** Minimum useful duration (seconds) to include a video */
export const MIN_VIDEO_DURATION_SECONDS = 60;

/** Max concurrent video fetch operations */
export const FETCH_CONCURRENCY = 5;

/** Delay between YouTube API requests (ms) to avoid rate limiting */
export const API_REQUEST_DELAY_MS = 150;

/** Max retries for transient network errors */
export const MAX_RETRIES = 3;

/** Retry delay base (ms) — exponential backoff: delay * 2^attempt */
export const RETRY_DELAY_BASE_MS = 1_000;
