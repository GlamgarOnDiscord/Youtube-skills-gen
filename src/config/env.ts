import { z } from 'zod';
import { ConfigError } from '../domain/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Environment schema — all config comes from .env or process.env
// Note: dotenv is loaded at CLI entry (import 'dotenv/config')
// ─────────────────────────────────────────────────────────────────────────────

const envSchema = z.object({
  // Required
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),

  // Optional — YouTube API key (required for channels & playlists)
  YOUTUBE_API_KEY: z.string().optional(),

  // LLM config
  GEMINI_ANALYSIS_MODEL: z.string().default('gemini-3.1-flash-lite-preview'),
  GEMINI_GENERATION_MODEL: z.string().default('gemini-3.1-pro-preview'),
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-3.1-flash-lite-preview'),
  GEMINI_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.3),
  GEMINI_MAX_OUTPUT_TOKENS: z.coerce.number().min(1024).max(65536).default(8192),

  // Pipeline
  MAX_VIDEOS: z.coerce.number().min(0).default(0),
  MAX_SKILLS: z.coerce.number().min(1).default(5),
  SKIP_NO_TRANSCRIPT: z
    .string()
    .transform((v) => v.toLowerCase() !== 'false')
    .default('true'),
  TRANSCRIPT_LANG: z.string().default('en'),

  // Storage
  CACHE_DIR: z.string().default('.ysgen-cache'),
  CACHE_TTL_HOURS: z.coerce.number().min(0).default(168),
  OUTPUT_DIR: z.string().default('./output'),

  // Dev
  LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
  NO_COLOR: z
    .string()
    .transform((v) => v.toLowerCase() === 'true')
    .default('false'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function loadEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new ConfigError(
      `Invalid configuration. Check your .env file:\n${issues}\n\nSee .env.example for reference.`,
    );
  }

  _env = result.data;
  return _env;
}

/** Synchronous env getter — must call loadEnv() first */
export function env(): Env {
  if (!_env) {
    throw new ConfigError('Environment not loaded. Call loadEnv() first.');
  }
  return _env;
}

/** True if YouTube API key is configured */
export function hasYouTubeKey(): boolean {
  return Boolean(_env?.YOUTUBE_API_KEY);
}
