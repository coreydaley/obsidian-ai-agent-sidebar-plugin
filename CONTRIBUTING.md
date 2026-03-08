# Contributing

## Prerequisites

- Node.js 20+
- An Obsidian vault for manual testing
- At least one supported agent installed (Claude Code, Codex, or Copilot) **or** an API key for one of the providers

## Development setup

```sh
npm install
make dev        # builds and installs the plugin into the test vault at vault/
```

`make dev` runs `npm run build` and copies `main.js`, `manifest.json`, and
`styles.css` into `vault/.obsidian/plugins/obsidian-ai-agent-sidebar/`. Open
`vault/` as a vault in Obsidian to test.

For watch mode without the vault setup:

```sh
npm run dev     # esbuild watch (no type-check)
npm run build   # type-check + production bundle
```

## Project structure

See `CLAUDE.md` for a full architecture overview. The short version:

- `src/main.ts` — plugin entry point
- `src/AgentRunner.ts` — CLI process runner + file-op protocol parser
- `src/AgentApiRunner.ts` — streaming API runner + file-op protocol parser
- `src/runnerFactory.ts` — selects CLI vs API runner based on settings
- `src/providers/` — per-provider API adapters (Anthropic, OpenAI, Gemini)
- `src/settings.ts` — settings UI

## Submitting changes

1. Fork the repository and create a branch from `main`.
2. Make your changes. Run `npm run build` to verify TypeScript passes before committing.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages:
   `feat(scope): add thing`, `fix(scope): correct thing`, `docs: update readme`, etc.
4. Open a pull request against `main`. Fill in the PR template.

## Releasing

Maintainers use the `/release` Claude Code command to publish releases. See
`.claude/commands/release.md` for details. Releases are tagged as bare semver
(`0.2.0`, not `v0.2.0`) to satisfy Obsidian's plugin installer requirements.
