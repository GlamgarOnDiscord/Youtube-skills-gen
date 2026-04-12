# YouTube Skills Generator (`ysgen`)

> Transform any YouTube channel, playlist, or set of videos into production-ready [Claude Code Skills](https://code.claude.com/docs/fr/skills) using Gemini AI.

## What It Does

`ysgen` distills the knowledge in YouTube content into **actionable Claude Code Skills** — structured instruction files that AI agents can execute. Instead of passively summarizing videos, it extracts workflows, decision frameworks, checklists, and methodologies, then packages them as proper Claude Code Skill files (`SKILL.md`).

```
YouTube Channel → Transcripts → Corpus → Gemini Analysis → Claude Code Skills
```

One channel = one base of reusable AI knowledge.

---

## Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Runtime | **Bun** | Native TypeScript, faster startup, built-in HTTP |
| CLI | **Commander.js** | Battle-tested, clean API |
| Terminal UX | **@clack/prompts + Chalk** | Premium interactive prompts |
| YouTube | **youtube-transcript + googleapis** | Transcripts (no auth) + metadata (API) |
| LLM | **Gemini 1.5 Pro** | 1M context window — entire channels fit |
| Validation | **Zod** | Runtime type safety for env + API responses |

---

## Installation

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- A [Gemini API key](https://aistudio.google.com/app/apikey)
- A [YouTube Data API v3 key](https://console.cloud.google.com/apis/api/youtube.googleapis.com) *(required for channels and playlists)*

### Setup

```bash
git clone https://github.com/glamgarondiscord/youtube-skills-gen
cd youtube-skills-gen
bun install

cp .env.example .env
# Fill in GEMINI_API_KEY and YOUTUBE_API_KEY
```

---

## Usage

### Interactive mode (recommended for first use)

```bash
bun dev
# or after installing globally:
ysgen generate
```

The wizard walks you through source selection, video limits, and output configuration.

### Command-line mode

```bash
# From a channel
ysgen generate --channel https://www.youtube.com/@fireship

# From a playlist
ysgen generate --playlist "https://www.youtube.com/playlist?list=PLxxx"

# From specific videos
ysgen generate \
  --video https://youtu.be/abc123 \
  --video https://youtu.be/def456

# Limit scope
ysgen generate \
  --channel https://www.youtube.com/@channel \
  --max-videos 50 \
  --max-skills 3 \
  --output ./my-skills

# Pre-fetch transcripts only (for offline/staged workflow)
ysgen fetch --channel https://www.youtube.com/@channel

# Inspect cache
ysgen inspect
ysgen inspect --list
ysgen inspect --clear-expired
```

### Full flag reference

```
ysgen generate [options]

  -c, --channel <url>          YouTube channel URL
  -p, --playlist <url>         YouTube playlist URL
  -v, --video <url...>         One or more video URLs
  -i, --interactive            Interactive wizard
  -o, --output <dir>           Output directory (default: ./output)
  --max-videos <n>             Limit videos processed (0 = all)
  --max-skills <n>             Max skills to generate (default: 5)
  --lang <code>                Transcript language (default: en)
  --no-cache                   Disable cache
  --skip-no-transcript         Skip videos without transcripts
  --dry-run                    Fetch + prepare only, skip generation
  --analysis-model <model>     Gemini model for analysis
  --generation-model <model>   Gemini model for generation
  --verbose                    Debug logging
```

---

## Output Structure

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

### Example `SKILL.md`

```markdown
---
name: tech-review-framework
description: Framework for conducting structured technology reviews. Use when reviewing gadgets, software tools, developer products, or comparing technical alternatives.
---

## Purpose
Apply a consistent, multi-dimensional evaluation framework to technology products to produce reviews that are technically rigorous, consumer-relevant, and benchmark-grounded.

## When to Use
- User asks to review a piece of technology, gadget, or software
- Comparison between technical products is requested
- Benchmarking or performance evaluation is needed
- "Should I buy X?" or "How good is X?" questions

## Prerequisites
- Access to the product or reliable technical specifications
- Benchmark data or test results
- Comparable alternatives for reference

## Core Procedure
1. **Define use case matrix** — Identify who this product serves (pro, consumer, enterprise)
2. **Establish benchmark baseline** — Set reference points before testing
3. **Run systematic tests** — Follow fixed test protocol: performance, build, ergonomics, value
4. **Document specific numbers** — Never use vague terms ("fast", "good") without metrics
5. **Identify the deal-breaker** — Find the one flaw that disqualifies the product for a segment
6. **Map to user profiles** — Conclude with "buy if X, skip if Y" for 3 user types
7. **Write verdict** — Single clear recommendation, no hedging

## Decision Framework
- If performance gap > 15% vs competition at same price → recommend alternative
- If build quality issues found → always mention in summary, not buried in body
- If product is niche → lead with use case before specs

## Quality Checklist
☐ At least 3 benchmark data points cited  
☐ Real-world usage scenario tested (not just synthetic)  
☐ Direct competitor comparison included  
☐ "Who should buy this" conclusion present  
☐ Price-to-value ratio addressed  

## Common Pitfalls
- Reviewing spec sheets instead of the actual product
- Leading with price without establishing value context first
- Using brand reputation to fill gaps in testing data
- Comparing against outdated models to make product look better

## Examples
**Good:** "The M4 chip scores 38,000 on Geekbench multi-core — 23% faster than the M3 — but thermal throttling kicks in after 8 minutes of sustained load."

**Bad:** "The chip is really fast and handles everything smoothly in our testing."
```

---

## Architecture

```
src/
├── cli/                    # CLI entry + commands + UI
│   ├── commands/           # generate, fetch, inspect
│   ├── ui/                 # display helpers, @clack prompts
│   └── index.ts            # Commander.js setup
├── providers/youtube/      # YouTube URL resolution + API client
│   ├── resolver.ts         # URL → source type detection
│   ├── client.ts           # YouTube Data API v3 wrapper
│   └── sources.ts          # Channel/playlist/video listing
├── extractors/             # Raw data extraction
│   ├── transcript.ts       # youtube-transcript wrapper
│   └── metadata.ts         # Metadata helpers
├── normalizers/            # Data cleaning
│   ├── text.ts             # Transcript noise removal
│   └── dedup.ts            # Near-duplicate detection
├── chunkers/
│   └── corpus.ts           # Token-aware corpus chunking
├── llm/                    # Gemini integration
│   ├── gemini.ts           # API client + retry logic
│   └── prompts.ts          # Analysis + generation prompts
├── skill-generator/        # Skill synthesis
│   ├── generator.ts        # Orchestrates analysis → clusters → skills
│   └── writer.ts           # SKILL.md file writer
├── pipeline/
│   └── index.ts            # Full end-to-end orchestrator
├── storage/
│   └── cache.ts            # Disk cache (transcript + metadata)
├── config/
│   ├── env.ts              # Zod env validation
│   └── defaults.ts         # Pipeline constants
├── logging/
│   └── logger.ts           # Structured logger
└── domain/
    └── index.ts            # All core types
```

### Data Flow

```
Input URL
  → resolver.ts (detect type: channel/playlist/video)
  → sources.ts (list video IDs via YouTube API)
  → transcript.ts (fetch transcripts via youtube-transcript)
  → text.ts (normalize, clean noise)
  → dedup.ts (remove near-duplicates)
  → corpus.ts (build + chunk corpus)
  → gemini.ts → prompts.ts (analyze → identify clusters)
  → gemini.ts → prompts.ts (generate SKILL.md per cluster)
  → writer.ts (write to disk with manifest)
```

---

## Configuration

All configuration via `.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | ✓ | — | Gemini API key |
| `YOUTUBE_API_KEY` | For channels/playlists | — | YouTube Data API v3 key |
| `GEMINI_ANALYSIS_MODEL` | | `gemini-1.5-pro` | Model for thematic analysis |
| `GEMINI_GENERATION_MODEL` | | `gemini-1.5-pro` | Model for skill generation |
| `GEMINI_TEMPERATURE` | | `0.3` | Generation temperature |
| `MAX_VIDEOS` | | `0` (all) | Videos per run |
| `MAX_SKILLS` | | `5` | Skills per run |
| `SKIP_NO_TRANSCRIPT` | | `true` | Skip videos without transcripts |
| `TRANSCRIPT_LANG` | | `en` | Preferred language |
| `CACHE_DIR` | | `.ysgen-cache` | Cache directory |
| `CACHE_TTL_HOURS` | | `168` (7 days) | Cache TTL |
| `OUTPUT_DIR` | | `./output` | Default output directory |

---

## Using Generated Skills

Copy the generated skill directories to your Claude skills folder:

```bash
# Personal skills (all projects)
cp -r ./output/channel-name-skills-2025-01-15/* ~/.claude/skills/

# Project-specific skills
cp -r ./output/channel-name-skills-2025-01-15/* .claude/skills/
```

Then in Claude Code:
- Skills are auto-invoked when relevant
- Or invoke manually: `/skill-name`
- List available: ask "What skills are available?"

---

## Extending

The architecture is designed for extension:

- **New sources**: Add a provider in `src/providers/` implementing the same interface as `sources.ts`
- **New LLMs**: Replace `src/llm/gemini.ts` with any provider
- **Custom prompts**: Edit `src/llm/prompts.ts` — `buildAnalysisPrompt` and `buildGenerationPrompt`
- **Post-processing**: Add steps in `src/pipeline/index.ts`
- **New output formats**: Extend `src/skill-generator/writer.ts`

---

## License

MIT
