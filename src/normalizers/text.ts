// ─────────────────────────────────────────────────────────────────────────────
// Text normalizer — clean raw YouTube transcript noise
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Patterns commonly found in auto-generated YouTube transcripts that add noise
 * without semantic value.
 */
const NOISE_PATTERNS: RegExp[] = [
  // Music / sound effect tags
  /\[(?:Music|Applause|Laughter|Silence|Sound|Noise|Background)[^\]]*\]/gi,
  // [BLANK_AUDIO], [INAUDIBLE], etc.
  /\[BLANK_AUDIO\]/gi,
  /\[INAUDIBLE\]/gi,
  /\[CROSSTALK\]/gi,
  // Filler words in square brackets
  /\[(?:uh|um|er|ah|hmm)\]/gi,
  // Timestamps like (00:00) or 00:00:00
  /\(\d{1,2}:\d{2}(?::\d{2})?\)/g,
  // HTML entities
  /&amp;/g,
  /&lt;/g,
  /&gt;/g,
  /&nbsp;/g,
  /&#39;/g,
  /&quot;/g,
];

/** Single-character repeated noise (e.g. "aaaaaaa") */
const REPEATED_CHARS = /(.)\1{5,}/g;

/** Multiple spaces → single space */
const MULTI_SPACE = /[ \t]+/g;

/** 3+ consecutive newlines → 2 newlines */
const MULTI_NEWLINE = /\n{3,}/g;

/**
 * Clean a raw transcript string:
 * 1. Strip YouTube noise tags
 * 2. Normalize whitespace
 * 3. Collapse repeated chars
 * 4. Fix punctuation spacing
 */
export function normalizeTranscript(raw: string): string {
  let text = raw;

  // Apply noise patterns
  for (const pattern of NOISE_PATTERNS) {
    text = text.replace(pattern, '');
  }

  // Replace HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');

  // Collapse repeated characters (likely ASR noise)
  text = text.replace(REPEATED_CHARS, '$1');

  // Normalize whitespace
  text = text.replace(MULTI_SPACE, ' ');
  text = text.replace(MULTI_NEWLINE, '\n\n');

  // Ensure sentences end with space when there's no punctuation gap
  // (youtube-transcript often joins lines without spaces)
  text = text.replace(/([a-z])([A-Z])/g, '$1 $2');

  return text.trim();
}

/**
 * Normalize a batch of transcript segments and join them into a single string.
 * Each segment text is cleaned individually before joining.
 */
export function joinAndNormalizeSegments(
  segments: Array<{ text: string }>,
): string {
  const joined = segments.map((s) => s.text.trim()).filter(Boolean).join(' ');
  return normalizeTranscript(joined);
}

/**
 * Estimate token count (rough: 1 token ≈ 4 characters).
 * Use for budget calculations, not billing.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Truncate text to a maximum token budget */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  // Cut at sentence boundary if possible
  const cutPoint = text.lastIndexOf('.', maxChars);
  return cutPoint > maxChars * 0.8 ? text.slice(0, cutPoint + 1) : text.slice(0, maxChars);
}
