# Sprint 003: Integration Test Suite

**Status:** Planned

## Overview

Two sprints have delivered a feature-complete plugin with CLI and API access modes. The four existing unit tests cover isolated helpers and pure functions — they do not test the behaviors that carry the highest runtime risk: the streaming parser's chunk-boundary logic, the canonical path traversal guard, and end-to-end runner selection. This sprint adds a deterministic integration test suite that validates multi-component behavior without requiring Obsidian, real API keys, or installed CLI agents.

The suite runs in Node via `make test-integration` and `npm run test-integration`, in a dedicated directory and config that is fully independent of the existing unit test suite. One minimal production-code change is required for testability: an optional provider-injection parameter on `AgentApiRunner`.

## Use Cases

1. **CI safety net**: `make test-integration` catches regressions in the streaming parser and path guard before merges.
2. **Refactor confidence**: When `AgentRunner`'s streaming parser or `FileOperationsHandler`'s path guard is modified, integration tests surface behavioral regressions that unit tests cannot detect.
3. **Protocol compliance**: The `:::file-op` protocol has chunk-boundary, malformed-JSON, and multi-block edge cases that require a real streaming subprocess to test correctly.

## Architecture

```
tests/
└── integration/
    ├── helpers/
    │   ├── mockObsidian.ts       vi.mock("obsidian") class stubs (TFile, TFolder, Notice, normalizePath)
    │   ├── mockVault.ts          MockApp + MockVault over real os.tmpdir(); includes fileManager stubs
    │   ├── streamFixtures.ts     Chunked :::file-op payload builders for reuse across tests
    │   └── fakeAgent.ts          Factory: write temp .mjs script → spawn via process.execPath
    ├── agent-runner.integration.test.ts
    ├── agent-api-runner.integration.test.ts
    ├── file-operations.integration.test.ts
    ├── runner-factory.integration.test.ts
    ├── agent-detector.integration.test.ts
    └── shell-env.integration.test.ts

vitest.integration.config.ts    (new — separate from vitest.config.ts)
```

### Integration test boundary

A test is "integration" for this sprint if it either:
- exercises two or more real source-code components interacting, or
- involves a real subprocess or real filesystem (not purely in-memory mocks)

UI tests (`AgentSidebarView`, `AgentChatTab`) and provider HTTP tests (Anthropic/OpenAI/Google network calls) are explicitly out of scope.

### Obsidian mock strategy

`FileOperationsHandler` imports `TFile`, `TFolder`, `normalizePath`, `App`, and `Notice` from `obsidian`. Since `obsidian` is not available in Node test environment, a `vi.mock('obsidian')` stub is registered in a vitest setup file. Key requirements:

- `TFile` and `TFolder` must be exported as real classes (not plain objects), because the handler uses `instanceof` checks.
- `Notice` must be a class with a `messageEl` that supports `createEl`, `createDiv`, `empty`, and `hide()`.
- `normalizePath` must normalize backslashes to forward slashes (matching Obsidian's real behavior: `path.replace(/\\/g, "/")`). **Do not** return the input fully unchanged — path traversal tests depend on correct normalization to match production behavior. Note: the mock is intentionally a simplified stub; it will not replicate edge cases of the real Obsidian path resolver. This is an accepted limitation for a Node test environment.

`MockVault` and `MockApp` wrap a real `os.tmpdir()` directory using Node `fs`, giving genuine filesystem behavior (real `path.resolve`, real file creation). `MockApp` exposes both `vault` and `fileManager` (with `trashFile` and `renameFile` backed by `fs.rm` and `fs.rename`).

### AgentApiRunner testability seam

`AgentApiRunner` currently hard-wires provider creation in its constructor. An optional `provider?: ProviderAdapter` parameter is added so tests can inject a mock `ProviderAdapter` without touching any production behavior:

```typescript
constructor(
  agentId: AgentId,
  apiKey: string,
  model: string,
  fileOpsHandler: FileOperationsHandler,
  debugMode = false,
  provider?: ProviderAdapter  // optional injection point for tests
) {
  ...
  this.provider = provider ?? this.createProvider(agentId, apiKey);
}
```

No existing callers are affected.

## Implementation Plan

### Phase 1: Infrastructure (~20%)

**Files:**
- `vitest.integration.config.ts` — new
- `package.json` — add script
- `Makefile` — add target
- `src/AgentApiRunner.ts` — add optional `provider` parameter
- `tests/integration/helpers/mockObsidian.ts` — obsidian module stub
- `tests/integration/helpers/mockVault.ts` — MockApp + MockVault over real temp dir
- `tests/integration/helpers/streamFixtures.ts` — chunked payload builders
- `tests/integration/helpers/fakeAgent.ts` — temp script factory

**Tasks:**
- [ ] Create `vitest.integration.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";
  export default defineConfig({
    test: {
      environment: "node",
      include: ["tests/integration/**/*.integration.test.ts"],
      testTimeout: 15_000,
      setupFiles: ["tests/integration/helpers/mockObsidian.ts"],
    },
  });
  ```
- [ ] Add `"test-integration": "vitest run --config vitest.integration.config.ts"` to `package.json` scripts
- [ ] Add `test-integration` to Makefile `.PHONY` line and add target:
  ```makefile
  test-integration:
  	npm run test-integration
  ```
- [ ] Add optional `provider?: ProviderAdapter` parameter to `AgentApiRunner` constructor; use `provider ?? this.createProvider(agentId, apiKey)`
- [ ] Implement `mockObsidian.ts`:
  - Export `class TFile { path = ""; name = ""; extension = ""; stat = {}; }` and `class TFolder { path = ""; name = ""; children: (TFile|TFolder)[] = []; }`
  - Export `class Notice { messageEl = mockFragment(); hide() {} }`
  - Export `normalizePath(p: string) { return p.replace(/\\/g, "/"); }`
  - Register via `vi.mock("obsidian", ...)` in this file so it applies globally
- [ ] Implement `mockVault.ts`:
  - `createTempVault(): { app: MockApp; vaultRoot: string; cleanup: () => void }` — creates temp dir, returns MockApp with vault root set
  - `MockVault`: `getAbstractFileByPath(path)` returns `TFile` or `TFolder` instances based on real fs stat; `read(file)` → `fs.readFile`; `create(path, content)` → `fs.writeFile` (mkdir -p); `process(file, fn)` → read+transform+write; `createFolder(path)` → `fs.mkdir`; `getRoot()` → `TFolder` with children populated from fs
  - `MockApp`: exposes `vault: MockVault`, `fileManager: { trashFile(file) → fs.rm, renameFile(file, newPath) → fs.rename }`, and `vault.adapter.basePath = vaultRoot`
- [ ] Implement `streamFixtures.ts`:
  - `fileOpBlock(op: object): string` — wraps a JSON object in `:::file-op\n...\n:::\n`
  - `splitAt(s: string, idx: number): [string, string]` — splits a string at index
  - `readBlock(path: string): string` — convenience for `:::file-op {"op":"read","path":"..."} :::`
  - `writeBlock(path: string, content: string): string` — convenience write block
- [ ] Implement `fakeAgent.ts`:
  - `writeFakeScript(tmpDir: string, chunks: string[]): string` — writes a `.mjs` file that sequentially `process.stdout.write`s each chunk with a small delay, then exits 0
  - Script accepts the full prompt as its last argument (matches one-shot adapter pattern)
  - Returns absolute path to the written script

### Phase 2: FileOperationsHandler Integration Tests (~20%)

**Files:**
- `tests/integration/file-operations.integration.test.ts`

**Tasks:**
- [ ] `beforeEach`: create temp vault via `createTempVault()`; `afterEach`: `cleanup()`
- [ ] Test: `read` returns file content (write file to temp dir first)
- [ ] Test: `read` returns `{ ok: false }` for nonexistent file
- [ ] Test: `write` creates a new file; verify with `fs.readFile`
- [ ] Test: `write` modifies an existing file; verify updated content
- [ ] Test: `delete` trashes a file (mock `trashFile` records call; verify `ok: true`)
- [ ] Test: `delete` returns `ok: false` when file not found
- [ ] Test: `delete` returns cancellation result when confirmation returns false
- [ ] Test: `rename` moves file to new path
- [ ] Test: `list` returns entries for a directory with files
- [ ] Test (traversal): `../etc/passwd` path → `{ ok: false, error: /resolves outside vault root/ }` **AND** verify no file was created or modified outside the temp vault root (invariant check, not just error string)
- [ ] Test (traversal): rename target `../../outside.md` → `{ ok: false, error: /resolves outside vault root/ }` **AND** verify original file was not moved
- [ ] Test (traversal): empty path → `{ ok: false, error: /cannot be empty/ }`

### Phase 3: AgentRunner Integration Tests (~25%)

**Files:**
- `tests/integration/agent-runner.integration.test.ts`

**Tasks:**
- [ ] Each test: write fake agent script to temp dir; create `AgentRunner` with adapter `binaryPath = process.execPath`, `command = ""` override to script path; use `MockFileOperationsHandler` stub that records calls and returns `{ ok: true, result: { content: "mock content", path: "test.md" } }` for reads
- [ ] Test: plain text stream produces `token` events and `complete` event
- [ ] Test: single `:::file-op` block in one chunk triggers `fileOpStart` + `fileOpResult`
- [ ] Test: `:::file-op` opener split across two chunks (`":::file-"` + `"op\n{...}\n:::\n"`) still parsed correctly — one `fileOpStart` event only
- [ ] Test: close delimiter split across chunks (`":::file-op\n{...}\n:"` + `":"` + `":\n"`) still parsed correctly
- [ ] Test: malformed JSON in `:::file-op` block — no crash, no `error` event, raw block appears in `token` stream
- [ ] Test: two consecutive file-op blocks → two `fileOpStart` / two `fileOpResult` events in order
- [ ] Test: mixed text + file-op + text — text portions emitted as tokens, op intercepted cleanly
- [ ] Test: stream ends with unclosed `:::file-op` block (partial EOF, no closing `:::`) — no crash, pending buffer content emitted as tokens or discarded cleanly; no `fileOpStart` event emitted for incomplete block
- [ ] Test: `:::file-op` delimiter characters appear inside normal text (e.g., `"::::"`) — not misinterpreted as file-op block
- [ ] Test: `dispose()` called while stream is active — no further events, no crash

### Phase 4: AgentApiRunner Integration Tests (~15%)

**Files:**
- `tests/integration/agent-api-runner.integration.test.ts`

**Tasks:**
- [ ] Inline `MockProviderAdapter` class:
  ```ts
  class MockProviderAdapter implements ProviderAdapter {
    constructor(public chunks: string[]) {}
    async *stream(): AsyncIterable<string> {
      for (const c of this.chunks) {
        await new Promise(r => setTimeout(r, 5));
        yield c;
      }
    }
    async listModels() { return ["mock-model"]; }
  }
  ```
- [ ] Test: plain text stream produces `token` events + `complete`
- [ ] Test: `:::file-op` read block in stream → `fileOpStart` + `fileOpResult`
- [ ] Test: `:::file-op` opener split across provider tokens → single file-op parsed correctly
- [ ] Test: inactivity timeout emits `error` event — use `vi.useFakeTimers()`, advance 30s, verify error message contains "timed out"
- [ ] Test: `dispose()` before `run()` → `error` event emitted

### Phase 5: runnerFactory Integration Tests (~10%)

**Files:**
- `tests/integration/runner-factory.integration.test.ts`

**Tasks:**
- [ ] Use fabricated `settings` and `detectionResults` (no real shell env or binaries needed)
- [ ] Test: CLI mode + binary installed → `run()` emits events (not error runner); verify runner type by behavior
- [ ] Test: API mode + api key present → `run()` starts without immediate error (use `AgentApiRunner` with mock provider)
- [ ] Test: CLI mode + binary missing → error runner emits `error` event with "binary not found" message
- [ ] Test: API mode + key missing → error runner emits `error` event with "API key not detected" message
- [ ] Test: invalid model name (contains `/`) → falls back to provider default model (no crash, no error event from factory itself)
- [ ] Test: unknown `accessMode` → error runner emits `error` event

### Phase 6: AgentDetector Integration Tests (~5%)

**Files:**
- `tests/integration/agent-detector.integration.test.ts`

**Tasks:**
- [ ] Test (deterministic): cache is `null` initially; after `detect()`, `getCache()` returns results array
- [ ] Test (deterministic): `clearCache()` resets to `null`; subsequent `detect()` repopulates
- [ ] Test (deterministic): Gemini adapter (no `cliCommand`) → `isInstalled: false`, `path: ""`, `hasApiKey` reflects env
- [ ] Test (deterministic): adapter with nonexistent command `"this-binary-xyz-doesnotexist"` → `isInstalled: false`, `path: ""`
- [ ] Test (smoke, skipIf): real `node` binary detection → `isInstalled: true`, `path` starts with `/` — use `describe.skipIf(!process.execPath)` (always available; this test should always run)

### Phase 7: shellEnv Integration Tests (~5%)

**Files:**
- `tests/integration/shell-env.integration.test.ts`

**Tasks:**
- [ ] Test: known env var set via `process.env` before call → appears in resolved map
- [ ] Test: `resolveShellEnv()` returns an object (doesn't crash, has string values) in CI environment where shell may vary
- [ ] Test: result falls back gracefully — temporarily set `process.env.SHELL` to a nonexistent path; call `resolveShellEnv()` and verify it returns a usable object rather than throwing. Note: this tests the `process.env` fallback path in `shellEnv.ts` without requiring deep injection of shell command internals.

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `vitest.integration.config.ts` | Create | Vitest config: integration suite only, 15s timeout, mockObsidian setup |
| `package.json` | Modify | Add `"test-integration"` script |
| `Makefile` | Modify | Add `test-integration` target |
| `src/AgentApiRunner.ts` | Modify | Add optional `provider?: ProviderAdapter` constructor param for testability |
| `tests/integration/helpers/mockObsidian.ts` | Create | vi.mock("obsidian") stub: TFile, TFolder, Notice, normalizePath |
| `tests/integration/helpers/mockVault.ts` | Create | MockApp + MockVault over real temp dir; fileManager.trashFile/renameFile |
| `tests/integration/helpers/streamFixtures.ts` | Create | Helpers for building chunked :::file-op payloads |
| `tests/integration/helpers/fakeAgent.ts` | Create | Factory: write temp .mjs script for controlled chunk output |
| `tests/integration/agent-runner.integration.test.ts` | Create | Streaming parser end-to-end: chunk splits, file-op parse, dispose, malformed JSON |
| `tests/integration/agent-api-runner.integration.test.ts` | Create | API streaming + file-op parsing + inactivity timeout (fake timers) + dispose |
| `tests/integration/file-operations.integration.test.ts` | Create | Real filesystem CRUD + path traversal + delete cancellation via MockVault |
| `tests/integration/runner-factory.integration.test.ts` | Create | Runner selection: CLI/API/error paths and model fallback |
| `tests/integration/agent-detector.integration.test.ts` | Create | Cache lifecycle, Gemini-only detection, missing binary; real-binary smoke test |
| `tests/integration/shell-env.integration.test.ts` | Create | Env resolution, fallback on shell failure |

## Definition of Done

- [ ] `make test-integration` runs and all integration tests pass
- [ ] `npm test` (unit tests) continues to pass unaffected
- [ ] `npm run build` (tsc + esbuild) passes with no errors
- [ ] Chunk-boundary file-op parsing covered by at least 2 tests (opener split, closer split)
- [ ] Path traversal guard covered by at least 3 tests (`../` read, `../../` rename target, empty path)
- [ ] `AgentApiRunner` inactivity timeout test uses `vi.useFakeTimers()` — no real 30s wait
- [ ] `runnerFactory` integration tests cover all 4 access-mode/capability combinations
- [ ] All tests that depend on real binaries use `describe.skipIf()` guards
- [ ] No test requires Obsidian runtime, real API keys, or real CLI agent binaries
- [ ] Tests are deterministic on repeated runs (no flaky timing)
- [ ] `delete` cancellation path tested — confirms mock auto-cancel returns `ok: false` result cleanly
- [ ] `AgentApiRunner` production code change (`provider` param) does not break existing callers — verified by TypeScript compilation and existing unit tests passing
- [ ] No leaked open handles: vitest integration config includes `pool: "forks"` to ensure subprocess cleanup; tests using `fakeAgent.ts` verify `complete` or `error` event before test ends
- [ ] `writeFakeScript` uses `JSON.stringify(chunks)` to embed chunk content (not template literal interpolation) — prevents injection from chunk strings
- [ ] Fake agent scripts created in unique temp directory per test via `fs.mkdtemp()`, with `0o700` permissions on the script file
- [ ] `shellEnv` test uses `vi.stubEnv('SHELL', ...)` for env mutation — auto-restored by vitest, no cross-test leakage
- [ ] `mockObsidian.ts` includes a comment documenting known differences from real Obsidian (especially `normalizePath` limitations)
- [ ] `AgentApiRunner` optional `provider` parameter has JSDoc comment: `/** For testing only — do not pass from production callers. */`

## Verification Matrix

| Scenario | Expected |
|----------|----------|
| `:::file-op` opener split across chunks | Single file-op parsed, one `fileOpStart` event |
| `:::file-op` closer split across chunks | Single file-op parsed, one `fileOpResult` event |
| Malformed JSON in `:::file-op` | No crash, raw block in `token` stream |
| Two consecutive file-op blocks | Two ordered `fileOpStart`/`fileOpResult` pairs |
| `../` read path | `{ ok: false, error: /resolves outside vault root/ }` |
| `../../` rename target | `{ ok: false, error: /resolves outside vault root/ }` |
| Empty path | `{ ok: false, error: /cannot be empty/ }` |
| `delete` with cancel | `{ ok: false, error: "Delete cancelled by user" }` |
| CLI mode, binary missing | Error runner emits "CLI binary not found" |
| API mode, key missing | Error runner emits "API key not detected" |
| Invalid model name | Factory uses provider default model |
| API runner stalls 30s | `error` event: "stream timed out" |
| `dispose()` mid-stream (CLI) | No further events, no unhandled errors |
| `dispose()` before `run()` (API) | Immediate `error` event |
| Gemini adapter detection | `isInstalled: false`, no CLI detection attempted |
| Missing binary detection | `isInstalled: false`, `path: ""` |
| `clearCache()` + `detect()` | Cache repopulated fresh |
| `make test-integration` | All integration tests pass |
| `npm test` | All existing unit tests still pass |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `obsidian` module mock drifts from real API shape | Medium | Medium | Keep mock minimal and targeted to methods actually called; add comment listing mocked methods |
| `instanceof TFile` check fails with vi.mock | High | High | Export `TFile` and `TFolder` as real `class` declarations, not plain object stubs |
| Fake agent subprocess timing causes flaky tests | Medium | Medium | Await `complete` event; never use `sleep`; `testTimeout: 15_000` provides headroom |
| `confirmDelete` DOM path fails in Node environment | High | High | `Notice` mock returns `messageEl` with no-op `createEl`/`createDiv`; test wires `onclick` directly |
| `AgentApiRunner` DI seam breaks existing callers | Low | Low | Parameter is optional; existing `new AgentApiRunner(id, key, model, handler)` calls unchanged |
| `os.tmpdir()` accumulates test dirs on crash | Low | Low | `afterEach` try/finally; OS cleans temp dirs; not a correctness issue |

## Security Considerations

- Integration tests spawn real subprocesses (fake agent `.mjs` scripts) — controlled outputs, no vault file access, no network calls, `shell: false` via existing `AgentRunner` implementation
- Temp directories are in `os.tmpdir()` — no user vault data is touched
- No real API keys are injected into tests; no network calls are made
- Path traversal tests verify the security-critical guard; failures in these tests are CI-blocking

## Dependencies

- SPRINT-001 and SPRINT-002 complete — all source modules exist
- No new npm packages — `vitest`, `@types/node`, `typescript` already in devDependencies
- Node built-ins used: `os`, `fs`, `path`, `child_process`

## Critiques Addressed

*From Codex's critique of the Claude draft:*

- **Script name**: Changed from `test:integration` to `test-integration` throughout ✓
- **Missing runnerFactory tests**: Added `runner-factory.integration.test.ts` with 6 scenarios ✓
- **MockApp needs fileManager**: `MockApp` now includes `fileManager.trashFile` and `fileManager.renameFile` backed by real `fs` operations ✓
- **TFile/TFolder instanceof**: Exported as real `class` declarations, not plain objects ✓
- **AgentApiRunner DI seam**: Optional `provider` parameter added to constructor ✓
- **Directory location**: Moved to top-level `tests/integration/` ✓
- **AgentDetector deterministic vs smoke split**: Clearly separated in Phase 6 ✓
- **shellEnv integration**: Added `shell-env.integration.test.ts` (Phase 7) ✓
- **streamFixtures helper**: Added to helpers ✓

## Open Questions

None — all interview questions resolved; all Codex critiques addressed.

## Devil's Advocate Critiques Addressed

*From Codex's devil's advocate review:*

- **`normalizePath` stub inconsistency**: Clarified — stub normalizes backslashes to forward slashes (matching real Obsidian behavior); limitation explicitly documented ✓
- **Streaming parser missing edge cases**: Added partial-EOF test (stream ends without closing `:::`) and delimiter-in-content test ✓
- **Missing negative assertions for traversal**: Tests now verify no filesystem writes occurred outside vault root (invariant, not just error string) ✓
- **Open handles / subprocess leaks**: DoD now requires all tests to await `complete`/`error` before ending; config uses `pool: "forks"` ✓
- **shellEnv fallback test platform coupling**: Simplified to use `process.env.SHELL` override instead of injectable shell command internals ✓

*Critiques rejected:*
- **Node-only harness limitation**: Accepted; Obsidian runtime is not CI-feasible. Tests validate our code's logic, not Obsidian itself.
- **Fake timers insufficient for real timeout**: Industry standard; real 30s waits are worse.
- **Phase % estimates unreliable**: Rough guidance only; not commitments.
- **Provider adapter contract tests**: Explicitly deferred in product owner interview.
- **Cross-platform CI matrix**: Future sprint concern; desktop-only plugin.
- **DI param backward compat not proven**: Covered by `npm run build` + `npm test` in DoD.
