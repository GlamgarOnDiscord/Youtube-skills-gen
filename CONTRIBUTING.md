# Contributing

## Setup

```bash
git clone https://github.com/glamgarondiscord/youtube-skills-gen
cd youtube-skills-gen
bun install
cp .env.example .env
```

## Workflow

1. Fork the repo
2. Create a branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Push and open a PR against `main`

## Guidelines

- Keep PRs focused — one feature or fix per PR
- Match the existing code style (TypeScript strict, no `any`)
- If adding a new LLM provider, implement the `LLMProvider` interface in `src/llm/provider.ts`
- If adding a CLI command, follow the pattern in `src/cli/commands/`

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug.md). Include:
- Your OS and Bun version
- The exact command you ran
- The full error output
