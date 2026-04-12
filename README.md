<div align="center">

# ✦ ysgen

**Transform YouTube content into Claude Code Skills — powered by Gemini AI**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-fbf0df?style=flat-square&logo=bun&logoColor=000)](https://bun.sh)
[![Gemini](https://img.shields.io/badge/Gemini-1.5_Pro-4285f4?style=flat-square&logo=google&logoColor=white)](https://aistudio.google.com)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](./LICENSE)

</div>

---

`ysgen` distills the knowledge in any YouTube channel, playlist, or video set into **actionable [Claude Code Skills](https://code.claude.com/docs/fr/skills)** — structured instruction files that AI agents can execute directly.

Instead of summarizing, it extracts **workflows, decision frameworks, checklists and methodologies**, then packages them as proper `SKILL.md` files ready to drop into `~/.claude/skills/`.

```
YouTube Channel  →  Transcripts  →  Corpus  →  Gemini Analysis  →  Claude Code Skills
```

---

## Features

- **Three input modes** — channel, playlist, individual videos, or manual IDs
- **Interactive wizard** — guided setup when no flags are provided
- **Smart corpus building** — token-aware chunking for Gemini's 1M context window
- **Near-dedup detection** — Jaccard shingles remove redundant videos before sending
- **TTL disk cache** — transcripts cached locally to avoid redundant API calls
- **Two-pass generation** — thematic analysis first, then per-cluster skill generation
- **Rich terminal UX** — live spinners, progress bars, clean summaries

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | **Bun** | Native TypeScript, fast startup |
| CLI | **Commander.js** | Battle-tested, clean flag API |
| Terminal UX | **@clack/prompts + Chalk** | Premium interactive wizard |
| YouTube | **youtube-transcript + googleapis** | Transcripts without auth + full metadata |
| LLM | **Gemini 1.5 Pro** | 1M context window — entire channels fit in one call |
| Validation | **Zod** | Runtime type safety for env and API responses |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- [Gemini API key](https://aistudio.google.com/app/apikey)
- [YouTube Data API v3 key](https://console.cloud.google.com/apis/api/youtube.googleapis.com) *(required for channels & playlists)*

### Setup

```bash
git clone https://github.com/glamgarondiscord/youtube-skills-gen
cd youtube-skills-gen
bun install

# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Then fill in `GEMINI_API_KEY` and `YOUTUBE_API_KEY` in `.env`.

---

## Usage

Three ways to run — pick whichever works for you.

### Method 1 — Direct (always works, no setup)

```bash
bun run src/cli/index.ts generate --channel https://www.youtube.com/@melvynxdev
bun run src/cli/index.ts generate --interactive
bun run src/cli/index.ts fetch --channel https://www.youtube.com/@channel
bun run src/cli/index.ts inspect --list
```

This is the most reliable option on every OS.

### Method 2 — npm scripts (after `git pull`)

```bash
# Interactive wizard
bun run generate

# From a channel
bun run generate --channel https://www.youtube.com/@melvynxdev

# From a playlist
bun run generate --playlist "https://www.youtube.com/playlist?list=PLxxx"

# Specific videos
bun run generate --video https://youtu.be/abc123 --video https://youtu.be/def456

# Scoped run
bun run generate --channel https://www.youtube.com/@channel --max-videos 50 --max-skills 3

# Pre-fetch transcripts
bun run fetch --channel https://www.youtube.com/@channel

# Cache management
bun run inspect
bun run inspect --list
bun run inspect --clear-expired
```

### Method 3 — `ysgen` command (Windows wrapper)

A `ysgen.cmd` wrapper is included in the repo. To use `ysgen` as a command from anywhere:

```cmd
:: Option A — add the project folder to your PATH (once)
setx PATH "%PATH%;C:\Users\Tom\Downloads\youtube-skills-gen"

:: Option B — copy the wrapper to an existing PATH directory
copy ysgen.cmd C:\Windows\System32\ysgen.cmd

:: Then use ysgen directly
ysgen generate --channel https://www.youtube.com/@melvynxdev
ysgen generate --interactive
ysgen inspect --list
```

### Flag reference

```
ysgen generate [options]

  -c, --channel <url>          YouTube channel URL
  -p, --playlist <url>         YouTube playlist URL
  -v, --video <url...>         One or more video URLs
  -i, --interactive            Launch interactive wizard
  -o, --output <dir>           Output directory  (default: ./output)
      --max-videos <n>         Videos to process (default: 0 = all)
      --max-skills <n>         Skills to generate (default: 5)
      --lang <code>            Transcript language (default: en)
      --no-cache               Disable transcript cache
      --skip-no-transcript     Skip videos without transcripts
      --dry-run                Prepare corpus only, skip LLM
      --analysis-model <m>     Gemini model for analysis pass
      --generation-model <m>   Gemini model for generation pass
      --verbose                Enable debug logging
```

---

## Output

```
output/
└── channel-name-skills-2025-01-15/
    ├── tech-review-framework/
    │   └── SKILL.md
    ├── camera-comparison-methodology/
    │   └── SKILL.md
    ├── product-launch-analysis/
    │   └── SKILL.md
    └── manifest.json
```

### Example generated `SKILL.md`

```markdown
---
name: tech-review-framework
description: Framework for conducting structured technology reviews. Use when
  reviewing gadgets, software tools, or comparing technical alternatives.
---

## Purpose
Apply a consistent, multi-dimensional evaluation framework to produce reviews
that are technically rigorous, benchmark-grounded, and consumer-relevant.

## When to Use
- User asks to review a piece of technology, gadget, or software
- Comparison between technical products is requested
- "Should I buy X?" or "How good is X?" questions

## Core Procedure
1. **Define use case matrix** — Identify who this product serves
2. **Establish benchmark baseline** — Set reference points before testing
3. **Run systematic tests** — Performance, build, ergonomics, value
4. **Document specific numbers** — Never use vague terms without metrics
5. **Identify the deal-breaker** — The flaw that disqualifies for a segment
6. **Map to user profiles** — "Buy if X, skip if Y" for 3 user types
7. **Write verdict** — Single clear recommendation, no hedging

## Decision Framework
- Performance gap > 15% at same price → recommend alternative
- Build quality issues found → mention in summary, not buried
- Niche product → lead with use case before specs

## Quality Checklist
☐ At least 3 benchmark data points cited
☐ Real-world usage scenario tested (not synthetic only)
☐ Direct competitor comparison included
☐ Price-to-value ratio addressed
```

---

## Architecture

```
src/
├── domain/index.ts            ← All core types (Video, Corpus, Skill, Pipeline…)
├── config/
│   ├── env.ts                 ← Zod environment validation
│   └── defaults.ts            ← Pipeline constants (tokens, concurrency, TTL…)
├── logging/logger.ts          ← Structured logger (stderr)
├── providers/youtube/
│   ├── resolver.ts            ← URL → source type detection
│   ├── client.ts              ← YouTube Data API v3 + exponential retry
│   └── sources.ts             ← Channel / playlist / video listing + enrichment
├── extractors/
│   ├── transcript.ts          ← youtube-transcript wrapper, typed error union
│   └── metadata.ts            ← Duration, slugify, context header helpers
├── normalizers/
│   ├── text.ts                ← Transcript noise removal (tags, HTML entities…)
│   └── dedup.ts               ← Near-dedup via Jaccard shingles + duration filter
├── chunkers/corpus.ts         ← Token-aware bin-packing for Gemini window
├── llm/
│   ├── gemini.ts              ← Gemini client — analysis (JSON) + generation
│   └── prompts.ts             ← Analysis prompt + SKILL.md generation prompt
├── skill-generator/
│   ├── generator.ts           ← Orchestrates: clusters → per-cluster generation
│   └── writer.ts              ← Writes SKILL.md + manifest.json to disk
├── storage/cache.ts           ← TTL disk cache (per-video JSON)
├── pipeline/index.ts          ← Full end-to-end orchestrator with callbacks
└── cli/
    ├── ui/display.ts          ← Box, progress bar, summary (Chalk + Unicode)
    ├── ui/prompts.ts          ← @clack/prompts interactive wizard
    ├── commands/generate.ts   ← generate command with live spinner
    ├── commands/fetch.ts      ← fetch command
    ├── commands/inspect.ts    ← inspect / cache management
    └── index.ts               ← Commander.js entry point
```

### Data flow

```
Input URL
  ↓ resolver.ts      — detect source type (channel / playlist / video)
  ↓ sources.ts       — list video IDs via YouTube API
  ↓ transcript.ts    — fetch transcripts (batched, concurrent)
  ↓ text.ts          — normalize and clean noise
  ↓ dedup.ts         — remove near-duplicates
  ↓ corpus.ts        — build + chunk corpus within token budget
  ↓ gemini.ts        — pass 1: analyze corpus → identify skill clusters (JSON)
  ↓ gemini.ts        — pass 2: generate SKILL.md per cluster
  ↓ writer.ts        — write output to disk with manifest
```

---

## Configuration

```env
# .env — see .env.example for all options

GEMINI_API_KEY=            # Required
YOUTUBE_API_KEY=           # Required for channels & playlists

GEMINI_ANALYSIS_MODEL=gemini-1.5-pro
GEMINI_GENERATION_MODEL=gemini-1.5-pro
GEMINI_TEMPERATURE=0.3

MAX_VIDEOS=0               # 0 = no limit
MAX_SKILLS=5
TRANSCRIPT_LANG=en
CACHE_TTL_HOURS=168        # 7 days
OUTPUT_DIR=./output
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | ✓ | — | Gemini API key |
| `YOUTUBE_API_KEY` | channels/playlists | — | YouTube Data API v3 key |
| `GEMINI_ANALYSIS_MODEL` | | `gemini-1.5-pro` | Analysis pass model |
| `GEMINI_GENERATION_MODEL` | | `gemini-1.5-pro` | Generation pass model |
| `GEMINI_TEMPERATURE` | | `0.3` | Generation temperature |
| `MAX_VIDEOS` | | `0` | Videos per run (0 = all) |
| `MAX_SKILLS` | | `5` | Skills to generate |
| `TRANSCRIPT_LANG` | | `en` | Preferred language |
| `CACHE_DIR` | | `.ysgen-cache` | Cache directory |
| `CACHE_TTL_HOURS` | | `168` | Cache TTL (hours) |
| `OUTPUT_DIR` | | `./output` | Default output root |

---

## Using generated skills

```bash
# Personal — available in all projects
cp -r ./output/channel-skills-2025-01-15/* ~/.claude/skills/

# Project-scoped
cp -r ./output/channel-skills-2025-01-15/* .claude/skills/
```

In Claude Code, skills are auto-invoked when relevant or triggered manually via `/skill-name`.

---

## Extending

| What | Where |
|---|---|
| New video source (podcast, RSS…) | Add a provider in `src/providers/` |
| Different LLM | Replace `src/llm/gemini.ts` |
| Tune prompts | Edit `src/llm/prompts.ts` |
| Add pipeline steps | `src/pipeline/index.ts` |
| New output format | `src/skill-generator/writer.ts` |

---

## License

MIT
