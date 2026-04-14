# Changelog

## [Unreleased]

### Added
- Claude provider (`--provider claude`) alongside Gemini
- `list` command — browse all generated skill sets
- `update` command — incremental update from source
- `regenerate` command — re-run LLM from cached transcripts
- `fetch` command — pre-fetch transcripts without generating
- Skill validator with 0–100 completeness scoring
- Multi-language skill output (`--output-lang`)

### Changed
- Modern terminal UI — boxed banner, circled menus, Braille spinner
- Wizard rebuilt with custom readline (cross-platform, no deps)

### Fixed
- Fallback to any available transcript when requested language unavailable
- Claude Opus pricing corrected ($15/$75 per million tokens)
