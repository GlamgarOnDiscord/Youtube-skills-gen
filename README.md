<div align="center">

# ✦ ysgen

**Turn any YouTube channel, playlist or video into Claude Code Skills — in one command**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-fbf0df?style=flat-square&logo=bun&logoColor=000)](https://bun.sh)
[![Gemini](https://img.shields.io/badge/Gemini-3.1_Pro-4285f4?style=flat-square&logo=google&logoColor=white)](https://aistudio.google.com)
[![Claude](https://img.shields.io/badge/Claude-Opus_4.6-d97757?style=flat-square)](https://anthropic.com)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](./LICENSE)

</div>

---

`ysgen` extracts the knowledge inside any YouTube content and packages it as **[Claude Code Skills](https://docs.anthropic.com/en/docs/claude-code/skills-and-workflows)** — structured `.md` files that tell Claude *exactly* how to apply a creator's methodology.

Instead of summarizing, it extracts **decision frameworks, step-by-step procedures, checklists and criteria** — then writes a proper `SKILL.md` ready to drop into `~/.claude/skills/`.

```
YouTube  →  Transcripts  →  Corpus  →  Gemini / Claude  →  SKILL.md
```

---

## Quickstart

```bash
# 1. Clone & install
git clone https://github.com/glamgarondiscord/youtube-skills-gen
cd youtube-skills-gen
bun install

# 2. Configure  (copy once, fill in your keys)
cp .env.example .env   # Windows: copy .env.example .env

# 3. Run — the wizard handles everything
bun start
```

That's it. The interactive wizard asks what to process, how many skills, which LLM, which language — then runs the full pipeline.

---

## What the wizard looks like

```
  ◆ What do you want to process?

  ╭────────────────────────────────────────────────────────╮
  │  ❶  YouTube Channel      @channelname or /channel/ID ◄ │
  │  ❷  YouTube Playlist     playlist?list=PLxxx            │
  │  ❸  One or more video URLs  youtu.be/xxx, ...           │
  │  ❹  Manual video IDs     raw IDs, comma-separated       │
  ╰────────────────────────────────────────────────────────╯

  ◆ LLM provider
  ╭────────────────────────────────────────────────────────╮
  │  ❶  Gemini   gemini-3.1-pro-preview  (GEMINI_API_KEY) ◄│
  │  ❷  Claude   claude-opus-4-6         (ANTHROPIC_API_KEY│
  ╰────────────────────────────────────────────────────────╯

  ◆ Skill language
  ╭──────────────────────────╮
  │  ❶  English  default  ◄  │
  │  ❷  Français             │
  │  ❸  Deutsch              │
  │  ❹  Español              │
  │  ❺  日本語               │
  │  ❻  Other…               │
  ╰──────────────────────────╯
```

---

## Installation (optional — use `ysgen` anywhere)

### Windows

```cmd
setx PATH "%PATH%;C:\path\to\youtube-skills-gen"
:: or copy the wrapper
copy ysgen.cmd C:\Windows\System32\
```

### macOS / Linux

```bash
# Option A — symlink
ln -s "$PWD/ysgen" /usr/local/bin/ysgen

# Option B — add to PATH in ~/.zshrc or ~/.bashrc
export PATH="$PATH:/path/to/youtube-skills-gen"
```

After that, use `ysgen` from anywhere instead of `bun start`.

---

## All commands

### Instant shortcuts (from project folder)

| Script | What it does |
|--------|-------------|
| `bun start` | Interactive wizard — recommended |
| `bun run gen -- --channel <url>` | Generate from a channel directly |
| `bun run list` | List all generated skill sets |
| `bun run update -- <dir>` | Pull new videos into an existing skill set |
| `bun run regen -- <dir>` | Re-run LLM from cached transcripts |
| `bun run fetch -- --channel <url>` | Pre-fetch transcripts without generating |
| `bun run inspect -- --stats` | Cache statistics |

### `ysgen generate` — full flag reference

```
ysgen generate [options]

Input (required, or use --interactive):
  -c, --channel <url>          YouTube channel URL
  -p, --playlist <url>         YouTube playlist URL
  -v, --video <url...>         One or more video URLs
  -i, --interactive            Launch the wizard

Output:
  -o, --output <dir>           Output directory  (default: ./output)
      --install                Auto-copy skills to ~/.claude/skills/

LLM:
      --provider <name>        gemini (default) | claude
      --output-lang <lang>     Skill language: fr, de, es, ja…  (default: en)
      --analysis-model <m>     Override analysis model
      --generation-model <m>   Override generation model

Filters:
      --max-videos <n>         Videos to process (0 = all)
      --max-skills <n>         Skills to generate (default: 5)
      --lang <code>            Transcript language (default: en)
      --min-views <n>          Skip videos with fewer than N views
      --since <date>           Only videos published after YYYY-MM-DD
      --max-age-days <n>       Only videos published within last N days
      --exclude-shorts         Skip YouTube Shorts (< 60 s)

Misc:
      --no-cache               Ignore transcript cache
      --skip-no-transcript     Skip videos without transcripts
      --dry-run                Corpus only — skip LLM
      --verbose                Debug logging
```

### `ysgen list` — browse previous runs

```bash
ysgen list              # scan ./output
ysgen list -o /my/dir   # scan a custom directory
```

### `ysgen update <dir>` — incremental update

Fetches new videos from the original source, merges with the cache, and regenerates all skills. Previously cached videos load instantly; only new ones are downloaded.

```bash
ysgen update ./output/fireship-skills-2025-01-15
ysgen update ./output/fireship-skills-2025-01-15 --install
```

### `ysgen regenerate <dir>` — re-run LLM only

Re-generates skills from cached transcripts — no network calls for videos.

```bash
ysgen regenerate ./output/fireship-skills-2025-01-15
ysgen regenerate ./output/fireship-skills-2025-01-15 --provider claude --output-lang fr
```

---

## Keys required

| Key | Where to get it | When needed |
|-----|----------------|-------------|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/app/apikey) | Always (default provider) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | `--provider claude` only |
| `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/apis/api/youtube.googleapis.com) | Channels & playlists |

---

## Output

```
output/
└── fireship-skills-2025-01-15/
    ├── frontend-performance/
    │   └── SKILL.md
    ├── web-security-fundamentals/
    │   └── SKILL.md
    ├── system-design-patterns/
    │   └── SKILL.md
    └── manifest.json
```

Each run shows a summary with token usage and estimated cost:

```
╭─ Complete ──────────────────────────────────────────────────╮
│  ✓ 3 skills generated  ·  42.3s                             │
│                                                             │
│  ◇ Frontend Performance                                     │
│    Optimize Core Web Vitals, lazy-loading, and bundle size  │
│  ◇ Web Security Fundamentals                                │
│    OWASP top 10, CSP headers, auth best practices           │
│  ◇ System Design Patterns                                   │
│    Scalable architectures, caching, database selection      │
│                                                             │
│  · 47 videos · 38 with transcripts                          │
│  · gemini · gemini-3.1-pro-preview · 84K in / 12K out · ~$0.16 │
│  · /path/to/output/fireship-skills-2025-01-15               │
╰─────────────────────────────────────────────────────────────╯
```

### Install generated skills

```bash
# Auto-install (wizard or --install flag)
ysgen generate --channel <url> --install

# Manual copy
cp -r ./output/fireship-skills-2025-01-15/* ~/.claude/skills/    # macOS / Linux
xcopy /E /I /Y "output\fireship-skills-2025-01-15\*" "%USERPROFILE%\.claude\skills\"  # Windows
```

Then use in Claude Code via `/<skill-name>`.

---

## Configuration

All settings have sensible defaults. Only the API keys are required.

```env
# .env

GEMINI_API_KEY=          # Required
YOUTUBE_API_KEY=         # Required for channels & playlists
ANTHROPIC_API_KEY=       # Required only with --provider claude

GEMINI_ANALYSIS_MODEL=gemini-3.1-flash-lite-preview
GEMINI_GENERATION_MODEL=gemini-3.1-pro-preview
GEMINI_TEMPERATURE=0.3
GEMINI_MAX_OUTPUT_TOKENS=8192

MAX_VIDEOS=0             # 0 = no limit
MAX_SKILLS=5
TRANSCRIPT_LANG=en
CACHE_TTL_HOURS=168      # 7 days
OUTPUT_DIR=./output
```

---

## Architecture

```
src/
├── domain/index.ts            ← All core types
├── config/env.ts              ← Zod environment validation
├── providers/youtube/         ← URL resolution, Data API v3, video listing
├── extractors/                ← Transcript fetch + metadata helpers
├── normalizers/               ← Noise removal, near-dedup (Jaccard)
├── chunkers/corpus.ts         ← Token-aware bin-packing
├── llm/
│   ├── provider.ts            ← LLMProvider interface + cost estimation
│   ├── gemini.ts              ← Gemini client (auto-fallback model)
│   ├── claude.ts              ← Claude client (@anthropic-ai/sdk)
│   └── prompts.ts             ← Analysis + generation prompts
├── skill-generator/
│   ├── generator.ts           ← Parallel cluster → skill orchestration
│   ├── validator.ts           ← Section completeness scoring
│   └── writer.ts              ← SKILL.md + manifest.json writer
├── storage/cache.ts           ← TTL disk cache (per-video JSON)
├── pipeline/index.ts          ← End-to-end orchestrator
└── cli/
    ├── ui/display.ts          ← Box renderer, progress bar, summary
    ├── ui/wizard.ts           ← Custom readline prompts (Unicode, cross-platform)
    ├── ui/prompts.ts          ← Full interactive wizard
    ├── commands/generate.ts   ← generate command
    ├── commands/regenerate.ts ← regenerate command
    ├── commands/list.ts       ← list command
    ├── commands/update.ts     ← update command
    ├── commands/fetch.ts      ← fetch command
    ├── commands/inspect.ts    ← inspect / cache management
    └── index.ts               ← Commander.js entry point
```

### Data flow

```
Input URL
  ↓ resolver.ts      — detect source type
  ↓ sources.ts       — list video IDs (YouTube Data API)
  ↓ transcript.ts    — fetch transcripts (concurrent, cached)
  ↓ text.ts          — clean and normalize
  ↓ dedup.ts         — remove near-duplicates (Jaccard shingles)
  ↓ corpus.ts        — build corpus within token budget
  ↓ llm (pass 1)     — analyze corpus → identify skill clusters (JSON)
  ↓ llm (pass 2)     — generate SKILL.md per cluster (parallel)
  ↓ writer.ts        — write output + manifest.json
```

---

## License

MIT
