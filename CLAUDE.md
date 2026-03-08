# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development

```sh
npm install
npm run build            # type-check (tsc --noEmit) then esbuild production bundle
npm run dev              # esbuild watch mode (no type-check)
npm test                 # unit tests (vitest)
npm run test-integration # integration tests (vitest, real CLI/env, ~15 s timeout)
npm run lint             # eslint src/
make test-integration    # equivalent make target
```

TypeScript type-checking is the primary correctness gate — always run `npm run build` before committing. Integration tests in `tests/integration/` exercise real processes and environment; they require the relevant CLI tools or API keys to be present.

To run a single integration test file:
```sh
npx vitest run --config vitest.integration.config.ts tests/integration/agent-api-runner.integration.test.ts
```

**Installing the plugin**: Copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/obsidian-ai-agent-sidebar/` and enable it in Obsidian settings.

## Architecture

This is an Obsidian plugin. The entry point is `src/main.ts` (`AgentSidebarPlugin extends Plugin`).

### Data flow

```text
AgentSidebarPlugin (main.ts)
  └── AgentSidebarView (ItemView — right sidebar panel)
        ├── AgentChatTab × N  (one per enabled agent)
        │     └── AgentExecutionRunner (CLI or API)
        └── FileOperationsHandler  (vault CRUD via Obsidian API)
```

### Runner architecture

Two runner implementations share the `AgentExecutionRunner` interface (`src/types.ts`):

- **`AgentRunner`** (`src/AgentRunner.ts`) — spawns CLI processes (`claude`, `codex`, `copilot`) via `child_process.spawn` with `shell: false`. Reads shell env via `shellEnv.ts`. All current adapters use the `one-shot` process model (new process per message).
- **`AgentApiRunner`** (`src/AgentApiRunner.ts`) — calls provider APIs directly using `@anthropic-ai/sdk`, `openai`, or `@google/generative-ai`. Uses `ProviderAdapter` implementations in `src/providers/`.

`src/runnerFactory.ts` selects between CLI and API mode based on `AgentConfig.accessMode`.

### File operation protocol

Both runners parse a custom delimiter protocol from streamed output:

```text
:::file-op
{"op":"write","path":"notes/new.md","content":"..."}
:::
```

The runners intercept these blocks mid-stream (handling chunk-boundary splits), execute them via `FileOperationsHandler`, and emit `fileOpStart`/`fileOpResult` events. Delete ops always require user confirmation via a modal.

### Provider/agent mapping

`src/providers.ts` defines `PROVIDERS: ProviderConfig[]` — the canonical list that drives settings UI and tab ordering. `src/AgentRunner.ts` defines `AGENT_ADAPTERS` — CLI-specific config (binary name, arg builders, YOLO flags). Each agent has both an `AgentId` (`claude | codex | gemini | copilot`) and a `ProviderId` (`anthropic | openai | google | github`).

### Key types (`src/types.ts`)

- `AgentAdapterConfig` — CLI adapter config (command, arg builder, YOLO flags, stdin vs arg input mode)
- `AgentExecutionRunner` — shared interface for both runners; extends EventEmitter
- `ProviderAdapter` — per-provider API streaming + model listing interface
- `PluginSettings` — persisted settings; keyed by `AgentId`

### API key resolution

API keys are read from shell environment at run time via `resolveShellEnv()` (`src/shellEnv.ts`), not from Obsidian's data store. Each provider checks a plugin-namespaced var first (`OBSIDIAN_AI_AGENT_SIDEBAR_*`) then standard fallbacks (`ANTHROPIC_API_KEY`, etc.).

### Integration tests (`tests/integration/`)

Each runner component has a corresponding `*.integration.test.ts`. Shared test infrastructure lives in `tests/integration/helpers/`:

- `obsidianStub.ts` — module alias target that satisfies Obsidian API imports at runtime (aliased via `vitest.integration.config.ts`)
- `mockVault.ts` / `mockObsidian.ts` — in-memory vault and Obsidian stubs
- `fakeAgent.ts` — minimal fake CLI agent binary used by AgentRunner tests
- `streamFixtures.ts` — canned streaming payloads for provider adapter tests

`AgentApiRunner` accepts an optional `provider?: ProviderAdapter` constructor argument to allow test doubles; production callers omit it.

## Sprint documentation

Sprint plans live in `docs/sprints/`. `docs/sprints/README.md` tracks the sprint ledger. Drafts are in `docs/sprints/drafts/`. Follow the existing sprint structure when adding new sprints.
