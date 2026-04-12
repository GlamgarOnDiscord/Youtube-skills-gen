import type { CorpusChunk, SkillCluster } from '../domain/index.ts';
import { buildVideoIndex, renderChunkForPrompt } from '../chunkers/corpus.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Gemini prompt templates — carefully crafted for high-quality skill generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analysis prompt: sends all transcripts, asks Gemini to identify skill clusters.
 * Returns a strict JSON response.
 */
export function buildAnalysisPrompt(params: {
  channelName: string;
  videoCount: number;
  maxSkills: number;
  chunk: CorpusChunk;
}): string {
  const { channelName, videoCount, maxSkills, chunk } = params;
  const videoIndex = buildVideoIndex(chunk.videos);
  const transcripts = renderChunkForPrompt(chunk);

  return `You are an expert knowledge distiller specializing in creating Claude Code Skills from video content.

## Context
You are analyzing ${videoCount} videos from the YouTube channel/source: "${channelName}".
${chunk.totalChunks > 1 ? `This is chunk ${chunk.chunkIndex + 1} of ${chunk.totalChunks}.` : ''}

## What is a Claude Code Skill?
A Claude Code Skill is a structured instruction file that teaches an AI agent how to perform a specific task, apply a methodology, or follow a workflow. It contains:
- Step-by-step procedures (not summaries)
- Decision frameworks and conditional logic
- Checklists and quality criteria
- Mental models and heuristics
- Actionable conventions and best practices

A skill is NOT a passive summary. It is EXECUTABLE KNOWLEDGE — an AI agent can follow it directly.

## Video Index
${videoIndex}

## Transcripts
${transcripts}

## Your Task
Identify ${maxSkills <= 1 ? '1 primary skill domain' : `up to ${maxSkills} distinct skill domains`} from the content above.

Each skill domain must:
1. Be **actionable** — represent a procedure or methodology, not just a topic
2. Be **standalone** — could be a complete skill by itself
3. Be **distinct** — clearly different from the other clusters
4. Have **sufficient depth** — enough content in the videos to generate real, useful instructions

## Output Format
Return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:

{
  "analysis": {
    "channel_summary": "One precise sentence describing what this channel teaches",
    "main_domains": ["domain1", "domain2"],
    "suggested_skill_count": 2
  },
  "skill_clusters": [
    {
      "id": "unique-kebab-id",
      "name": "Human Readable Skill Name",
      "slug": "kebab-case-slug",
      "description": "What this skill enables and WHEN to invoke it (max 200 chars, include natural trigger words a user would say)",
      "core_competency": "The specific thing a user can DO with this skill (e.g. 'Conduct a structured technical interview')",
      "video_ids": ["VIDEO_ID_1", "VIDEO_ID_2"],
      "key_concepts": ["concept1", "concept2", "concept3"],
      "estimated_depth": "shallow"
    }
  ]
}

Depth values: "shallow" (simple checklist), "medium" (multi-step workflow), "deep" (complex methodology)

CRITICAL: Use only video IDs from the Video Index above. Return valid JSON only.`;
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
