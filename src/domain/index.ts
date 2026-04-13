// ─────────────────────────────────────────────────────────────────────────────
// Domain — Core types for the entire pipeline
// ─────────────────────────────────────────────────────────────────────────────

// ── Video ────────────────────────────────────────────────────────────────────

export type VideoId = string;

export interface VideoChapter {
  title: string;
  startSeconds: number;
}

export interface VideoMetadata {
  id: VideoId;
  title: string;
  description: string;
  channelId: string;
  channelName: string;
  publishedAt: string;
  durationSeconds: number;
  thumbnailUrl: string;
  url: string;
  viewCount?: number;
  tags?: string[];
  chapters?: VideoChapter[];
}

export interface TranscriptSegment {
  text: string;
  /** Offset from start of video in ms */
  offset: number;
  /** Duration of segment in ms */
  duration: number;
}

export interface VideoWithTranscript extends VideoMetadata {
  /** Full cleaned transcript text */
  transcript: string;
  /** Raw transcript text before normalization */
  transcriptRaw?: string;
  segments?: TranscriptSegment[];
  language?: string;
}

export type VideoStatus =
  | 'pending'
  | 'fetching'
  | 'complete'
  | 'no-transcript'
  | 'unavailable'
  | 'error'
  | 'cached';

export interface VideoResult {
  id: VideoId;
  status: VideoStatus;
  video?: VideoWithTranscript;
  error?: string;
  /** True if loaded from disk cache */
  fromCache?: boolean;
}

// ── Source Resolution ─────────────────────────────────────────────────────────

export type YouTubeSourceType = 'channel' | 'playlist' | 'video' | 'manual';

export interface YouTubeSource {
  type: YouTubeSourceType;
  /** Original URL as provided by user */
  originalUrl: string;
  /** Resolved ID (channel ID / playlist ID / video ID) */
  resolvedId?: string;
  /** Display name (channel name / playlist title / video title) */
  displayName?: string;
}

// ── Corpus ────────────────────────────────────────────────────────────────────

export interface CorpusVideo {
  id: VideoId;
  title: string;
  channelName: string;
  url: string;
  publishedAt: string;
  durationSeconds: number;
  transcript: string;
  /** Estimated token count (rough: chars / 4) */
  estimatedTokens: number;
}

export interface Corpus {
  source: YouTubeSource;
  videos: CorpusVideo[];
  totalTokens: number;
  createdAt: string;
}

export interface CorpusChunk {
  videos: CorpusVideo[];
  totalTokens: number;
  chunkIndex: number;
  totalChunks: number;
}

// ── Skill ─────────────────────────────────────────────────────────────────────

export interface SkillCluster {
  id: string;
  name: string;
  slug: string;
  description: string;
  coreCompetency: string;
  videoIds: VideoId[];
  keyConcepts: string[];
  estimatedDepth: 'shallow' | 'medium' | 'deep';
}

export interface GeneratedSkill {
  cluster: SkillCluster;
  /** Raw SKILL.md content (frontmatter + body) */
  content: string;
  /** Parsed frontmatter name */
  skillName: string;
  /** Parsed frontmatter description */
  skillDescription: string;
  /** Supporting files to generate alongside SKILL.md */
  supportingFiles?: Array<{ filename: string; content: string }>;
  /** Which videos contributed to this skill */
  sourceVideoIds: VideoId[];
  /** Token count of the generated skill */
  tokenCount: number;
}

export interface SkillManifest {
  generatedAt: string;
  source: YouTubeSource;
  videosProcessed: number;
  videosWithTranscripts: number;
  /** All video IDs included in the corpus (used by regenerate command) */
  videoIds?: string[];
  skills: Array<{
    name: string;
    slug: string;
    path: string;
    videoCount: number;
    description: string;
  }>;
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export interface PipelineOptions {
  source: YouTubeSource | YouTubeSource[];
  outputDir: string;
  maxVideos?: number;
  maxSkills?: number;
  skipNoTranscript?: boolean;
  useCache?: boolean;
  dryRun?: boolean;
  transcriptLang?: string;
  geminiAnalysisModel?: string;
  geminiGenerationModel?: string;
  /** LLM provider: 'gemini' (default) or 'claude' */
  provider?: 'gemini' | 'claude';
  /** Claude API key override */
  claudeApiKey?: string;
  /** Language for generated skill content (e.g. 'fr', 'de') */
  outputLang?: string;
  /** Minimum view count to include a video */
  minViews?: number;
  /** Only include videos published after this ISO date */
  since?: string;
  /** Only include videos published within the last N days */
  maxAgeDays?: number;
  /** Exclude YouTube Shorts (< 60 seconds) */
  excludeShorts?: boolean;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface PipelineResult {
  success: boolean;
  videosProcessed: number;
  videosWithTranscripts: number;
  videosSkipped: number;
  skillsGenerated: number;
  skills?: GeneratedSkill[];
  outputPaths: string[];
  /** Root output directory (cross-platform, no path-splitting needed) */
  outputDir?: string;
  manifestPath?: string;
  durationMs: number;
  errors: string[];
  /** LLM token usage across all calls */
  totalUsage?: TokenUsage;
  /** Provider used for generation */
  providerName?: string;
  /** Models used */
  analysisModel?: string;
  generationModel?: string;
}

export interface PipelineProgress {
  phase:
    | 'resolving'
    | 'listing'
    | 'extracting'
    | 'normalizing'
    | 'analyzing'
    | 'generating'
    | 'writing';
  current?: number;
  total?: number;
  message?: string;
}

export type ProgressCallback = (progress: PipelineProgress) => void;

// ── Analysis Response (from Gemini) ──────────────────────────────────────────

export interface GeminiAnalysisResponse {
  analysis: {
    channel_summary: string;
    main_domains: string[];
    suggested_skill_count: number;
  };
  skill_clusters: Array<{
    id: string;
    name: string;
    slug: string;
    description: string;
    core_competency: string;
    video_ids: string[];
    key_concepts: string[];
    estimated_depth: 'shallow' | 'medium' | 'deep';
  }>;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class YouTubeError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'YouTubeError';
  }
}

export class TranscriptError extends Error {
  constructor(
    message: string,
    public readonly videoId?: string,
  ) {
    super(message);
    this.name = 'TranscriptError';
  }
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
