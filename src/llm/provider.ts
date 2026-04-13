import type { Corpus, SkillCluster, GeminiAnalysisResponse } from '../domain/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// LLM Provider abstraction — swap Gemini for Claude or any other LLM
// ─────────────────────────────────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMProvider {
  /** Analyze a corpus and return skill clusters */
  analyzeCorpus(
    corpus: Corpus,
    maxSkills: number,
    onProgress?: (msg: string) => void,
  ): Promise<{ result: GeminiAnalysisResponse; usage: TokenUsage }>;

  /** Generate a SKILL.md for a single cluster */
  generateSkill(
    corpus: Corpus,
    cluster: SkillCluster,
    onProgress?: (msg: string) => void,
    outputLang?: string,
  ): Promise<{ content: string; name: string; description: string; usage: TokenUsage }>;

  /** Model names for display */
  readonly analysisModel: string;
  readonly generationModel: string;
  /** Provider name for display ("gemini" | "claude") */
  readonly providerName: string;
}

export interface LLMProviderConfig {
  apiKey: string;
  analysisModel: string;
  generationModel: string;
  temperature: number;
  maxOutputTokens: number;
  /** Model to fall back to if primary fails (optional) */
  fallbackGenerationModel?: string;
}

// ── Pricing table (per million tokens) ────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  // Claude — keys must match Anthropic API model IDs
  'claude-opus-4-20250514':     { input: 15.00, output: 75.00 },
  'claude-sonnet-4-20250514':   { input: 3.00,  output: 15.00 },
  'claude-haiku-4-20250514':    { input: 1.00,  output: 5.00  },
  'claude-opus-4-5-20251101':   { input: 15.00, output: 75.00 },
  'claude-sonnet-4-5-20241022': { input: 3.00,  output: 15.00 },
  // Gemini (approximate — check aistudio.google.com for current rates)
  'gemini-1.5-pro':              { input: 1.25,  output: 5.00  },
  'gemini-1.5-flash':            { input: 0.075, output: 0.30  },
  'gemini-2.0-flash':            { input: 0.10,  output: 0.40  },
  'gemini-2.5-pro-preview':      { input: 1.25,  output: 10.00 },
  'gemini-2.5-flash-preview':    { input: 0.15,  output: 0.60  },
  // gemini-3.1 models — check aistudio.google.com for actual pricing
  'gemini-3.1-pro-preview':      { input: 1.25,  output: 10.00 }, // placeholder
  'gemini-3.1-flash-lite-preview': { input: 0.075, output: 0.30 }, // placeholder
};

/**
 * Estimate cost in USD for a given token usage + model.
 * Returns null if the model price is unknown.
 */
export function estimateCost(model: string, usage: TokenUsage): number | null {
  const price = PRICING[model];
  if (!price) return null;
  return (usage.inputTokens / 1_000_000) * price.input
       + (usage.outputTokens / 1_000_000) * price.output;
}

export function formatCost(usd: number | null): string {
  if (usd === null) return '?';
  if (usd < 0.01) return `<$0.01`;
  return `$${usd.toFixed(3)}`;
}
