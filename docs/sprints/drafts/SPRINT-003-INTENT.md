# Sprint 003 Intent: Integration Test Suite

## Seed

> lets create some integration tests for this project that can be run using the "make test-integration" command

## Context

The project has four unit test files (vitest) that cover small, isolated behaviors: `buildSystemPrompt`, `sanitiseError`, `MODEL_FORMAT`, `SHELL_INJECTION_PATTERN`, and cache behavior. There are **no integration tests** — the core streaming parser, path traversal guard, binary detection, and runner selection logic are untested at a multi-component level.

Key constraint: the plugin runs inside Obsidian/Electron, so most tests must mock the Obsidian API. However, several subsystems can be tested in a Node environment if we provide thin stubs for `app.vault`.

## Recent Sprint Context

- **SPRINT-001**: Delivered CLI-based plugin. Designed the `:::file-op` streaming protocol, `AgentRunner`, `FileOperationsHandler`, `AgentDetector`, and tab-based sidebar UI.
- **SPRINT-002**: Added API mode (`AgentApiRunner`), provider-centric settings, `ProviderAdapter` pattern, `runnerFactory`, and `shellEnv`. Pinned SDK package versions. Added `resolveShellEnv()` with process.env fallback.

## Relevant Codebase Areas

| Module | Purpose | Integration Test Angle |
|--------|---------|----------------------|
| `src/AgentRunner.ts` | Spawns CLI agents, buffered streaming parser, :::file-op extraction | Spawn real echo subprocess; verify chunk-split handling, token events, file-op events |
| `src/FileOperationsHandler.ts` | Vault CRUD with canonical path validation | Mock `app.vault` over a real temp dir; test read/write/delete/rename/list + traversal guard |
| `src/AgentDetector.ts` | `which`-based binary detection + API key env var check | Run real detection against current PATH; test cache lifecycle |
| `src/AgentApiRunner.ts` | API streaming, :::file-op parser, inactivity timeout | Mock `ProviderAdapter` that yields chunks on a schedule; verify timeout, abort, file-op parse |
| `src/runnerFactory.ts` | Selects CLI or API runner from settings + detection | Create runners from fabricated detection results; verify error runner, CLI runner, API runner |
| `src/shellEnv.ts` | Shell environment resolution | Test with known env vars; verify fallback to process.env on failure |

## Constraints

- Must follow project conventions in CLAUDE.md
- Must use `vitest` (already a devDependency)
- Integration tests must live in a separate directory from unit tests so they can be run independently
- `make test-integration` target must be added to the Makefile
- `npm run test-integration` script must be added to `package.json`
- Integration tests MUST NOT require Obsidian to be running — they run in Node environment
- Integration tests SHOULD NOT require real API keys or real CLI agents installed
- Tests that do rely on real environment (e.g., real binary detection) must skip gracefully when the binary is not present
- Cannot test UI components (`AgentSidebarView`, `AgentChatTab`) — they require the Obsidian DOM APIs

## Success Criteria

- `make test-integration` runs the integration test suite without errors
- Integration tests cover the three highest-risk subsystems: streaming parser (chunk boundary), path traversal guard, and runner selection
- Tests are deterministic — no flaky reliance on real network or real binaries without skip guards
- Existing `npm test` (unit tests) continues to pass unaffected
- TypeScript compiles without errors

## Verification Strategy

- Reference implementation: none; behavior is defined by the `:::file-op` protocol documented in CLAUDE.md and SPRINT-001
- Spec/documentation: SPRINT-001 Verification Matrix (section "Definition of Done") defines expected behaviors
- Edge cases identified:
  - `:::file-op` block split across two or more stream chunks (chunk-boundary)
  - Multiple file-op blocks in a single stream
  - Malformed JSON inside a `:::file-op` block
  - Path containing `../` (traversal attempt)
  - Path that resolves outside vault root
  - Empty path
  - AgentApiRunner with inactivity timeout (30s stall)
  - Disposed runner called again
  - Detection with binary absent (skip guard)

## Uncertainty Assessment

- **Correctness uncertainty: Low** — the streaming parser and path guard have well-defined expected behaviors in the sprint docs
- **Scope uncertainty: Medium** — deciding what counts as "integration" vs "unit" needs to be settled (proposed boundary: integration = two or more real components interacting, or a real subprocess/filesystem involved)
- **Architecture uncertainty: Low** — vitest is already in use; separate config file is a minor addition

## Open Questions (Resolved via Interview)

1. **Obsidian mock**: Use `vi.mock('obsidian')` stub in a vitest setup file. MockVault implements vault methods over a real temp dir. No production code changes needed.
2. **Fake agent**: Write a temporary `.mjs` script to disk; spawn via `process.execPath` (Node itself). Fully deterministic, no external deps.
3. **Provider HTTP tests**: Out of scope for this sprint. Provider adapters are thin vendor SDK wrappers; HTTP mocking adds complexity for low value.
4. **AgentDetector detection**: Include real binary detection tests with `.skipIf()` guards for missing binaries.
