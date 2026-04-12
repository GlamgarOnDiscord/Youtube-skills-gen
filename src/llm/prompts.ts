import type { CorpusVideo, SkillCluster } from '../domain/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Gemini prompt templates — carefully crafted for high-quality skill generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analysis prompt — metadata-only strategy.
 *
 * Sends video titles + a short transcript snippet (300 chars) for every video.
 * This keeps input well under 100K tokens regardless of channel size, while
 * giving Gemini enough signal to cluster videos by theme/competency.
 *
 * Full transcripts are only sent during the generation pass (per cluster).
 */
export function buildMetadataAnalysisPrompt(params: {
  channelName: string;
  videos: CorpusVideo[];
  maxSkills: number;
}): string {
  const { channelName, videos, maxSkills } = params;

  const videoList = videos
    .map((v, i) => {
      const snippet = v.transcript.slice(0, 300).replace(/\s+/g, ' ').trim();
      return (
        `${String(i + 1).padStart(3)}. [${v.id}] ${v.title} ` +
        `(${Math.round(v.durationSeconds / 60)}min)\n` +
        `     Preview: ${snippet}`
      );
    })
    .join('\n\n');

  return `You are an expert knowledge distiller specializing in creating Claude Code Skills from video content.

## What is a Claude Code Skill?
A Claude Code Skill teaches an AI agent to perform a specific task, apply a methodology, or follow a workflow. It must be:
- **Actionable** — a procedure or methodology, not just a topic
- **Executable** — an AI agent can follow it step by step
- **Standalone** — complete enough to be its own skill

## Your Task
Analyze the ${videos.length} videos from "${channelName}" listed below and identify up to ${maxSkills} distinct skill domains.

Each domain must:
1. Represent a real, repeatable workflow or competency
2. Have enough video coverage to produce meaningful instructions
3. Be clearly distinct from the other domains

## Video Catalog
${videoList}

## Output Format
Return ONLY a valid JSON object — no markdown, no explanation, no extra text.

{
  "analysis": {
    "channel_summary": "One precise sentence describing what this channel teaches",
    "main_domains": ["domain1", "domain2"],
    "suggested_skill_count": 3
  },
  "skill_clusters": [
    {
      "id": "unique-kebab-id",
      "name": "Human Readable Skill Name",
      "slug": "kebab-case-slug",
      "description": "What this skill enables and when to invoke it (max 200 chars, use natural trigger words)",
      "core_competency": "The specific thing a user can DO with this skill",
      "video_ids": ["VIDEO_ID_1", "VIDEO_ID_2"],
      "key_concepts": ["concept1", "concept2", "concept3"],
      "estimated_depth": "medium"
    }
  ]
}

Rules:
- Depth values: "shallow" (checklist), "medium" (multi-step workflow), "deep" (complex methodology)
- video_ids: include the 15-20 MOST REPRESENTATIVE video IDs for each cluster — not all of them
- video_ids must contain only IDs from the catalog above
- descriptions must be under 200 characters
- key_concepts: max 4 entries, each under 30 characters
- Return complete, valid JSON — keep the response compact`;
}

/**
 * Generation prompt: generates a complete SKILL.md for a single cluster.
 * The output IS the SKILL.md content — starts with "---".
 */
export function buildGenerationPrompt(params: {
  channelName: string;
  cluster: SkillCluster;
  transcriptContent: string;
  videoCount: number;
}): string {
  const { channelName, cluster, transcriptContent, videoCount } = params;

  return `You are writing a Claude Code Skill (SKILL.md file) that will be used by AI agents.

## Source
Channel/Source: "${channelName}"
Skill to create: "${cluster.name}"
Core competency: "${cluster.coreCompetency}"
Based on: ${videoCount} videos

## What Claude Code Skills Must Be
Claude Code Skills are instruction files loaded into AI agent context. They teach the agent to:
- Follow a specific procedure or workflow
- Apply a methodology consistently
- Make decisions using a defined framework
- Check work against quality criteria

They use **imperative, instructional language** — written as if instructing a capable AI agent.
They do NOT summarize, explain history, or discuss the content. They INSTRUCT.

## Key Concepts to Cover
${cluster.keyConcepts.map((k) => `- ${k}`).join('\n')}

## Source Transcripts
${transcriptContent}

## Required Output Format
Generate a complete SKILL.md file. Start immediately with the YAML frontmatter delimiter ---.
Do NOT add any text before or after the SKILL.md content.

The frontmatter MUST be:
---
name: ${cluster.slug}
description: ${cluster.description}
---

Then write the skill body with these exact sections (## headers):

### Required sections:
1. **## Purpose** — What this skill enables (2-3 sentences max)
2. **## When to Use** — Precise conditions/triggers (use bullet list, be specific)
3. **## Prerequisites** — What must be ready before invoking (tools, context, permissions)
4. **## Core Procedure** — THE MAIN NUMBERED WORKFLOW (this is the heart of the skill — be detailed, specific, actionable)
5. **## Decision Framework** — If/when/then conditional logic for key choices
6. **## Quality Checklist** — ☐ checkboxes for verifying the work is done correctly
7. **## Common Pitfalls** — Specific mistakes to avoid (from the video content)
8. **## Examples** — 1-2 concrete, realistic usage examples

### Writing rules:
- Use imperative mood: "Run X", "Check Y", "Never Z", "When A then B"
- Be specific: use exact terms, tool names, patterns from the videos
- No vague advice like "consider X" or "it may be good to Y"
- Every bullet point must be actionable on its own
- Keep sentences short and direct
- Do not repeat yourself across sections
- Cite techniques/frameworks by name if they appear in the videos

Target length: 300-500 lines. Quality over quantity — every line must earn its place.`;
}

/**
 * Post-processing: if Gemini returns extra content around the SKILL.md,
 * extract just the frontmatter + body.
 */
export function extractSkillContent(rawOutput: string): string {
  const trimmed = rawOutput.trim();

  // Find the first "---" delimiter
  const firstDelim = trimmed.indexOf('---');
  if (firstDelim === -1) {
    // No frontmatter found — wrap it
    return `---\nname: generated-skill\ndescription: Generated skill from YouTube content\n---\n\n${trimmed}`;
  }

  return trimmed.slice(firstDelim);
}

/**
 * Parse the YAML frontmatter of a SKILL.md to extract name and description.
 * Returns null fields if not found.
 */
export function parseFrontmatter(content: string): {
  name: string | null;
  description: string | null;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: null, description: null };

  const yaml = match[1];
  const nameMatch = yaml.match(/^name:\s*(.+)$/m);
  const descMatch = yaml.match(/^description:\s*(.+)$/m);

  return {
    name: nameMatch?.[1]?.trim() ?? null,
    description: descMatch?.[1]?.trim() ?? null,
  };
}
