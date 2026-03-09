# Sprint 006 Intent: AgentChatTab Unit Tests + CLI/API Mode-Switching Coverage

## Seed

> now that we have mock tests in place for the API agents, i want to see if we can find a way to provide mock tests for the CLI agents so that we can test switching back and forth between those and the API agents and making sure that the chat interface works correctly with them. The first job is to figure out if this is even possible somehow to mock.

## Context

Sprint 005 completed the API mock infrastructure: `MockProviderAdapter` injected into `AgentApiRunner`, mock HTTP server for E2E tests. CLI agents have been mocked since Sprint 003 via `writeFakeScript` / `writeHangingScript` in `fakeAgent.ts`, which spawn real Node.js subprocesses producing controlled output.

What does NOT yet exist:
- Any unit or integration tests for `AgentChatTab` — the layer that binds runner events (token, complete, error, fileOpStart, fileOpResult) to the DOM
- Any tests verifying that `AgentChatTab` behaves correctly with *both* a CLI runner and an API runner (the shared `AgentExecutionRunner` interface)
- Any tests verifying the mode-switching lifecycle (destroy old tab → create new tab with different runner type)

`AgentChatTab` uses Obsidian's custom DOM extension API: `createDiv`, `createEl`, `createSpan`, `addClass`, `removeClass`, `empty`, `querySelector`. Obsidian is unavailable in Node, but vitest supports a **JSDOM environment** (`environment: "jsdom"`) that provides real DOM. Obsidian's element extensions can be polyfilled on `HTMLElement.prototype` in a vitest setup file, making `AgentChatTab` fully instantiable without Obsidian.

## Recent Sprint Context

- **Sprint 003**: Integration test suite — `fakeAgent.ts` (CLI mock), `MockProviderAdapter` for AgentApiRunner, StreamFixtures, MockVault, mockObsidian stub
- **Sprint 004**: Playwright E2E — plugin load, sidebar, settings UI tests; no chat interaction
- **Sprint 005**: Base URL env var overrides; mock HTTP server; E2E chat interaction tests for Anthropic + OpenAI API modes with real mock server

## Relevant Codebase Areas

| File | Role |
|------|------|
| `src/AgentChatTab.ts` | UI layer: binds runner events to DOM, manages conversation history |
| `src/AgentSidebarView.ts` | View layer: tab lifecycle, runner creation via `createRunner` |
| `src/runnerFactory.ts` | Factory: selects `AgentRunner` or `AgentApiRunner` based on `accessMode` |
| `src/AgentRunner.ts` | CLI runner: spawns processes via `child_process.spawn` |
| `src/AgentApiRunner.ts` | API runner: calls provider APIs, accepts optional `ProviderAdapter` injection |
| `tests/integration/helpers/fakeAgent.ts` | CLI mock: `writeFakeScript`, `writeHangingScript` |
| `tests/integration/helpers/mockObsidian.ts` | Obsidian module stub (TFile, TFolder, Notice, normalizePath) |
| `tests/integration/agent-runner.integration.test.ts` | CLI runner tests (already comprehensive) |
| `tests/integration/agent-api-runner.integration.test.ts` | API runner tests (already comprehensive) |

## Constraints

- Must follow project conventions in CLAUDE.md (Conventional Commits, no over-engineering, no new comments unless non-obvious)
- Must integrate with existing test infrastructure (vitest, existing helper patterns)
- No new npm packages required (vitest already supports JSDOM; `jsdom` is a vitest peer dep)
- Must not modify production source code except where strictly necessary for testability
- CLI runner tests already exist and are comprehensive — do NOT re-test what's already covered

## Success Criteria

1. `AgentChatTab` can be instantiated in a JSDOM environment without Obsidian
2. Tests verify `AgentChatTab` correctly handles `token`, `complete`, `error`, `fileOpStart`, `fileOpResult` events from an EventEmitter runner stub
3. Tests verify `AgentChatTab` works identically whether the runner is a CLI runner stub or an API runner stub
4. Tests verify the mode-switching lifecycle: same agentId, different `accessMode` → different runner type from `createRunner`, chat tab created fresh each time
5. All existing tests continue to pass

## Verification Strategy

- Reference implementation: `AgentChatTab.ts` is the source of truth; tests must match its event contract
- Edge cases: streaming message element created before tokens arrive; error replaces streaming state; fileOp cards render/replace
- Testing approach: vitest unit tests with JSDOM + HTMLElement polyfills; EventEmitter-based runner stubs (no real CLI or API needed for AgentChatTab tests); existing `fakeAgent.ts` scripts for mode-switching tests where a real spawned process is needed

## Uncertainty Assessment

- **Correctness uncertainty**: Low — `AgentChatTab`'s event contract is well-defined and stable
- **Scope uncertainty**: Low — the test targets are clear: `AgentChatTab` event handling + mode-switching factory behavior
- **Architecture uncertainty**: Medium — Obsidian DOM polyfill approach is novel for this codebase; need to verify all used APIs can be polyfilled in JSDOM

## Approaches Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A: JSDOM + HTMLElement polyfill for AgentChatTab unit tests** | Tests exactly the logic we care about; fast; no subprocess overhead; both runner types trivially injectable via EventEmitter stub | Requires polyfilling Obsidian element extensions; some Obsidian APIs may be hard to stub (e.g. `workspace.getActiveFile`) | **Selected** — polyfill surface is small and well-contained; `app.workspace.getActiveFile` can return `null` in tests |
| **B: Integration tests with real fakeAgent + real AgentApiRunner mock, no DOM** | Reuses existing infrastructure; no DOM polyfill needed | Doesn't test `AgentChatTab` at all — only tests the runner layer (already covered); doesn't verify the chat interface | Rejected — doesn't address the user's actual goal |
| **C: E2E tests with fake CLI binary in Obsidian** | Tests the full stack including real Obsidian DOM | Very heavyweight; requires fake binary on PATH; CLI mode in E2E is complex; slow | Rejected — disproportionate complexity for what's essentially a unit-level concern |

## Open Questions

1. Which Obsidian `HTMLElement` extension methods does `AgentChatTab` actually use? (Need to audit before finalizing polyfill surface)
2. Does the vitest JSDOM environment's `HTMLElement` polyfill need to be global (applied in setup file) or local to test files?
3. Should mode-switching tests call `createRunner` twice (same agentId, different accessMode) or should they instantiate runners directly?
