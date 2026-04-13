// ─────────────────────────────────────────────────────────────────────────────
// Skill validator — checks generated SKILL.md for required sections
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_SECTIONS = [
  '## Purpose',
  '## When to Use',
  '## Prerequisites',
  '## Core Procedure',
  '## Decision Framework',
  '## Quality Checklist',
  '## Common Pitfalls',
  '## Examples',
] as const;

export interface ValidationResult {
  valid: boolean;
  missingSections: string[];
  warnings: string[];
  score: number; // 0-100
}

/**
 * Validate a generated SKILL.md for completeness.
 * Returns a score and list of missing/weak sections.
 */
export function validateSkillContent(content: string, skillName: string): ValidationResult {
  const missingSections: string[] = [];
  const warnings: string[] = [];

  // Check required sections
  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      missingSections.push(section);
    }
  }

  // Check frontmatter
  if (!content.match(/^---\n[\s\S]*?\n---/)) {
    warnings.push('Missing or malformed YAML frontmatter');
  }

  // Check Quality Checklist has actual checkboxes
  if (content.includes('## Quality Checklist')) {
    const checklistMatch = content.match(/## Quality Checklist\n([\s\S]*?)(?=\n##|$)/);
    const checkboxes = checklistMatch?.[1]?.match(/☐|✓|\[ \]|\[x\]/gi) ?? [];
    if (checkboxes.length < 3) {
      warnings.push('Quality Checklist has fewer than 3 checkboxes');
    }
  }

  // Check Core Procedure has numbered steps
  if (content.includes('## Core Procedure')) {
    const procedureMatch = content.match(/## Core Procedure\n([\s\S]*?)(?=\n##|$)/);
    const steps = procedureMatch?.[1]?.match(/^\d+\./gm) ?? [];
    if (steps.length < 3) {
      warnings.push('Core Procedure has fewer than 3 numbered steps');
    }
  }

  // Check minimum content length (300 lines target)
  const lineCount = content.split('\n').length;
  if (lineCount < 100) {
    warnings.push(`Skill is short (${lineCount} lines — target is 300+)`);
  }

  const missingPenalty = missingSections.length * 12;
  const warningPenalty = warnings.length * 5;
  const score = Math.max(0, 100 - missingPenalty - warningPenalty);

  return {
    valid: missingSections.length === 0,
    missingSections,
    warnings,
    score,
  };
}
