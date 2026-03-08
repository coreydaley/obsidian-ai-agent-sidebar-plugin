# Sprint 003: Integration Test Suite

## Overview

Two sprints have built a feature-complete plugin. What's missing is confidence that the components work together correctly under realistic conditions. The four existing unit tests cover isolated behaviors (regex patterns, helper functions, cache state) — but not the behaviors that are most likely to fail in practice: the streaming parser's chunk-boundary handling, the path traversal guard under real file system conditions, and the end-to-end runner selection logic.

This sprint adds an integration test suite that runs in Node (no Obsidian required), invoked via `make test-integration`. Integration tests are defined here as tests where two or more real components interact, or where a real subprocess or filesystem is involved. They complement, not replace, the unit tests.

The goal is deterministic coverage of the highest-risk behaviors documented in SPRINT-001's Verification Matrix, specifically those that are impossible to test correctly with mocks alone: chunk-split parsing, real filesystem path validation, and subprocess spawning.

## Use Cases

1. **CI safety net**: `make test-integration` runs in CI to catch regressions in the streaming parser and path guard before merges.
2. **Refactor confidence**: When the streaming parser or FileOperationsHandler is modified, integration tests catch behavioral regressions that unit tests miss.
3. **Protocol compliance**: The `:::file-op` protocol has several edge cases (chunk splits, malformed JSON, multiple ops, nested :::) that require end-to-end testing to verify correctly.

## Architecture

```
src/
├── __tests__/
│   ├── (unit tests — unchanged)
│   │   ├── AgentApiRunner.test.ts
│   │   ├── AgentDetector.test.ts
│   │   ├── AgentRunner.test.ts
│   │   └── runnerFactory.test.ts
│   └── integration/
│       ├── helpers/
│       │   ├── mockVault.ts           (Mock app.vault over a real temp dir)
│       │   └── fakeAgent.ts           (Node script: emits controlled chunks)
│       ├── AgentRunner.integration.test.ts
│       ├── FileOperationsHandler.integration.test.ts
│       ├── AgentApiRunner.integration.test.ts
│       └── AgentDetector.integration.test.ts
├── vitest.config.ts                   (unchanged — unit tests only)
└── vitest.integration.config.ts       (NEW — integration tests only)
```

### How fake agents work

`AgentRunner` spawns a binary with args. For integration tests, we spawn a real Node subprocess that reads the full prompt from its last argument and writes a predetermined, chunked response to stdout. A helper function `writeFakeScript(chunks: string[])` writes a temporary `.mjs` file that outputs the given chunks with small delays (simulating real streaming) then exits.

### How MockVault works

`FileOperationsHandler` uses Obsidian's `app.vault` API. `MockVault` implements the subset of the vault API used by the handler (`getAbstractFileByPath`, `read`, `create`, `process`, `delete`, `rename`) using Node `fs` operations on a real `os.tmpdir()` directory. `MockApp` wraps `MockVault` to satisfy the `App` type. This gives us real filesystem behavior (real path resolution, real file creation) without Obsidian.

## Implementation Plan

### Phase 1: Infrastructure (~20%)

**Files:**
- `vitest.integration.config.ts` — new vitest config for integration tests (longer timeout, Node environment, separate include pattern)
- `package.json` — add `"test:integration"` script
- `Makefile` — add `test-integration` target
- `src/__tests__/integration/helpers/mockVault.ts` — mock vault + app for FileOperationsHandler
- `src/__tests__/integration/helpers/fakeAgent.ts` — factory for fake agent scripts

**Tasks:**
- [ ] Create `vitest.integration.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";
  export default defineConfig({
    test: {
      environment: "node",
      include: ["src/__tests__/integration/**/*.test.ts"],
      testTimeout: 15_000,  // subprocess tests need more time
    },
  });
  ```
- [ ] Add `"test:integration": "vitest run --config vitest.integration.config.ts"` to `package.json` scripts
- [ ] Add `test-integration` target to Makefile:
  ```makefile
  test-integration:
  	npm run test:integration
  ```
- [ ] Implement `MockVault` in `helpers/mockVault.ts`:
  - Creates a fresh temp directory per test via `beforeEach` / `afterEach`
  - Implements `getAbstractFileByPath(path)`: returns a `TFile`-like object (with `path` field) if file exists, `null` otherwise
  - Implements `read(file)`: reads file content from temp dir
  - Implements `create(path, content)`: creates file in temp dir (including parent dirs)
  - Implements `process(file, fn)`: reads, transforms, and writes back
  - Implements `delete(file)`: deletes file from temp dir
  - Implements `rename(file, newPath)`: renames file in temp dir
  - Sets `vaultRoot` to temp directory path so path validation runs against a real path
- [ ] Implement `fakeAgent.ts`:
  - `writeFakeScript(tmpDir, chunks: string[], delayMs = 5): string` — writes a `.mjs` file to `tmpDir` that processes and emits chunks sequentially via `process.stdout.write`, then exits 0
  - Script receives the prompt as the last argument (matches `one-shot` adapter pattern)
  - Returns the path to the written script

### Phase 2: AgentRunner Integration Tests (~30%)

**Files:**
- `src/__tests__/integration/AgentRunner.integration.test.ts`

**Tasks:**
- [ ] Test: plain text output produces token events
  - Fake agent emits `["Hello ", "world\n"]`
  - Expect `token` events containing `"Hello "` and `"world\n"` (or accumulated)
  - Expect `complete` event after process exits
- [ ] Test: single :::file-op block in one chunk
  - Fake agent emits `[':::file-op\n{"op":"read","path":"test.md"}\n:::\n']`
  - Expect `fileOpStart` event with `op.op === "read"`
  - Expect `fileOpResult` event after handler responds
- [ ] Test: :::file-op block split across two chunks (critical chunk-boundary case)
  - Fake agent emits `[':::file-', 'op\n{"op":"read","path":"test.md"}\n:::\n']`
  - Same expectations as above — block must still be detected
- [ ] Test: :::file-op close delimiter split across chunks
  - Fake agent emits `[':::file-op\n{"op":"read","path":"test.md"}\n:', ':', ':\n']`
  - Same expectations — close delimiter must be assembled across chunks
- [ ] Test: malformed JSON in :::file-op block is treated as plain text (no crash)
  - Fake agent emits `[':::file-op\nnot-valid-json\n:::\n']`
  - Expect `token` event with the raw text (or partial text)
  - Expect `complete` event — no crash, no `error` event
- [ ] Test: multiple :::file-op blocks in one stream
  - Fake agent emits two consecutive file-op blocks (read + write)
  - Expect two `fileOpStart` / `fileOpResult` event pairs
- [ ] Test: mixed text and file-op blocks
  - Fake agent emits: `text → file-op block → text`
  - Expect token events for text portions, fileOpStart/Result for op
- [ ] Test: dispose() while stream is active kills process cleanly
  - Start a fake agent that emits text then waits
  - Call `runner.dispose()` mid-stream
  - Expect no further events; no unhandled errors

**Implementation notes:**
- Each test creates a new `AgentRunner` with a dummy `claude` adapter where `binaryPath = process.execPath` (Node itself) and the fake script is passed as the first arg
- `MockFileOperationsHandler` is a lightweight stub that records calls and returns `{ ok: true }` for reads
- Tests bind event listeners before calling `run()`

### Phase 3: FileOperationsHandler Integration Tests (~30%)

**Files:**
- `src/__tests__/integration/FileOperationsHandler.integration.test.ts`

**Tasks:**
- [ ] Setup: `beforeEach` creates a fresh `MockVault` backed by `os.tmpdir()`; `afterEach` cleans up temp dir
- [ ] Test: `read` returns file content
  - Write `test.md` with content `"# Hello"` to temp dir
  - Call `handler.execute({ op: "read", path: "test.md" })`
  - Expect `{ ok: true, result: { content: "# Hello", path: "test.md" } }`
- [ ] Test: `read` returns error for nonexistent file
  - Call `handler.execute({ op: "read", path: "missing.md" })`
  - Expect `{ ok: false, error: ... }`
- [ ] Test: `write` creates a new file
  - Call `handler.execute({ op: "write", path: "new.md", content: "# New" })`
  - Expect `{ ok: true }` and file exists in temp dir with correct content
- [ ] Test: `write` modifies an existing file
  - Create `existing.md` in temp dir
  - Call `handler.execute({ op: "write", path: "existing.md", content: "Updated" })`
  - Expect content changed to `"Updated"`
- [ ] Test: `delete` removes an existing file
  - Create `delete-me.md`
  - Call `handler.execute({ op: "delete", path: "delete-me.md" })`
  - Expect `{ ok: true }` and file no longer exists
- [ ] Test: `rename` moves a file to a new path
  - Create `old.md`
  - Call `handler.execute({ op: "rename", oldPath: "old.md", newPath: "new.md" })`
  - Expect `old.md` gone, `new.md` exists with same content
- [ ] Test: `list` returns files in a directory
  - Create `folder/a.md` and `folder/b.md`
  - Call `handler.execute({ op: "list", path: "folder" })`
  - Expect result contains both file names
- [ ] Test (path traversal): `../` path is rejected
  - Call `handler.execute({ op: "read", path: "../etc/passwd" })`
  - Expect `{ ok: false, error: /resolves outside vault root/i }`
- [ ] Test (path traversal): path resolving to vault root itself is rejected
  - Call `handler.execute({ op: "read", path: "." })`
  - Expect `{ ok: false }` (file not found, not a TFile)
- [ ] Test (path traversal): rename target outside vault root is rejected
  - Create `safe.md` inside vault
  - Call `handler.execute({ op: "rename", oldPath: "safe.md", newPath: "../../outside.md" })`
  - Expect `{ ok: false, error: /resolves outside vault root/i }`
- [ ] Test: empty path returns error
  - Call `handler.execute({ op: "read", path: "" })`
  - Expect `{ ok: false, error: /cannot be empty/i }`

### Phase 4: AgentApiRunner Integration Tests (~15%)

**Files:**
- `src/__tests__/integration/AgentApiRunner.integration.test.ts`

**Tasks:**
- [ ] Implement `MockProviderAdapter` in the test file:
  ```ts
  async *stream(messages, context, model): AsyncIterable<string> {
    for (const chunk of this.chunks) {
      await new Promise(r => setTimeout(r, 5));
      yield chunk;
    }
  }
  async listModels() { return ["mock-model"]; }
  ```
- [ ] Test: plain text stream produces token events
  - Adapter yields `["Hello ", "world"]`
  - Expect `token` events; `complete` event
- [ ] Test: :::file-op block in API stream is parsed and executed
  - Adapter yields `[':::file-op\n{"op":"read","path":"test.md"}\n:::\n']`
  - Expect `fileOpStart` + `fileOpResult` events
- [ ] Test: :::file-op block split across API stream chunks
  - Adapter yields `[':::file-', 'op\n{"op":"read","path":"test.md"}\n:::\n']`
  - Same expectations as CLI runner (parser is shared logic)
- [ ] Test: inactivity timeout fires after 30 seconds of silence
  - Adapter that never yields (hangs indefinitely via a never-resolving promise)
  - Expect `error` event with `"timed out"` message within timeout + small buffer
  - Use vitest fake timers to advance time without real waiting
- [ ] Test: dispose() before run() emits error
  - Call `runner.dispose()` then `runner.run()`
  - Expect `error` event

### Phase 5: AgentDetector Integration Tests (~5%)

**Files:**
- `src/__tests__/integration/AgentDetector.integration.test.ts`

**Tasks:**
- [ ] Test: `detect()` returns a result for each adapter (skip if any binary missing)
  - Skips gracefully when `which node` is unavailable (should always be available in CI)
  - For each result, verify shape: `{ id, name, command, path, isInstalled, hasApiKey, apiKeyVar }`
- [ ] Test: detection result for `node` binary (always available)
  - Create a fake adapter with `command: "node"`
  - Expect `isInstalled: true`, `path` starting with `/`
- [ ] Test: detection result for nonexistent binary
  - Create adapter with `command: "this-binary-does-not-exist-xyz"`
  - Expect `isInstalled: false`, `path: ""`
- [ ] Test: cache is populated after first `detect()` call
  - Call `detect()` twice
  - Second call returns cached result (verify no new subprocess by checking timing)
- [ ] Test: `clearCache()` then `detect()` re-runs detection
  - Populate cache, clear, detect again — shape should be same

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `vitest.integration.config.ts` | Create | Vitest config for integration test suite; 15s timeout; separate include pattern |
| `package.json` | Modify | Add `"test:integration"` script |
| `Makefile` | Modify | Add `test-integration` target |
| `src/__tests__/integration/helpers/mockVault.ts` | Create | MockVault + MockApp backed by real temp dir for FileOperationsHandler tests |
| `src/__tests__/integration/helpers/fakeAgent.ts` | Create | Helper to write temporary fake agent Node scripts with controlled chunk output |
| `src/__tests__/integration/AgentRunner.integration.test.ts` | Create | Streaming parser end-to-end: chunk-boundary, file-op parse, dispose, malformed JSON |
| `src/__tests__/integration/FileOperationsHandler.integration.test.ts` | Create | Real filesystem CRUD + path traversal guard via MockVault |
| `src/__tests__/integration/AgentApiRunner.integration.test.ts` | Create | API streaming + file-op parsing + inactivity timeout (fake timers) |
| `src/__tests__/integration/AgentDetector.integration.test.ts` | Create | Real binary detection with skip guards |

## Definition of Done

- [ ] `make test-integration` executes successfully with all integration tests passing
- [ ] `npm test` (unit tests) continues to pass unaffected
- [ ] `npm run build` (TypeScript + bundle) passes
- [ ] Chunk-boundary file-op parsing covered by at least 2 tests (open split, close split)
- [ ] Path traversal guard covered by at least 3 tests (`../`, rename target, empty path)
- [ ] AgentRunner dispose() during active stream verified to clean up without crash
- [ ] AgentApiRunner inactivity timeout test uses vitest fake timers (not real 30s wait)
- [ ] All integration tests skip gracefully when required binaries are missing (`.skipIf()` guards)
- [ ] No test depends on real API keys or network access
- [ ] No test depends on real Claude/Codex/Copilot/Gemini binaries
- [ ] Tests are deterministic on repeated runs

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `FileOperationsHandler` uses Obsidian types that can't be imported in Node | High | High | MockVault implements only the methods used; obsidian module is mocked via vitest `vi.mock()` or avoided entirely |
| Fake agent subprocess timing causes flaky tests | Medium | Medium | Use `complete` event promise resolution, not fixed sleep; set generous `testTimeout` |
| `os.tmpdir()` cleanup leaves junk if test crashes | Low | Low | `afterEach` with try/finally; also acceptable — OS cleans temp dirs |
| Inactivity timeout test takes 30s in real time | High | Medium | Use vitest fake timers (`vi.useFakeTimers()`) to advance time without waiting |
| `obsidian` module unavailable in test environment | High | High | Add `vi.mock("obsidian", ...)` stub or import only via the MockVault adapter pattern |

## Security Considerations

- Integration tests spawn real subprocesses (fake agent scripts) — these are controlled, write no files outside temp dirs, and use `shell: false` via the existing `AgentRunner` implementation
- Test temp directories are created in `os.tmpdir()` — no vault data or secrets are touched
- No real API keys are used; no network calls are made in integration tests
- Path traversal tests verify the security-critical guard; failures here are CI-blocking

## Dependencies

- SPRINT-001 and SPRINT-002 complete
- No new npm packages required — vitest, `@types/node` already present
- `os`, `fs`, `path`, `child_process` are Node builtins available in test environment

## Open Questions

1. Does `FileOperationsHandler` need `obsidian` module at import time (type-only imports), or will TypeScript's `import type` allow avoiding a full mock? — Inspect after reading source more carefully.
2. Should `AgentDetector` integration tests run in CI where no CLI agents are installed? `.skipIf()` guards handle this but need careful scoping.
3. Should we also integration-test the `shellEnv.ts` module (spawning a shell and reading env)? It's low-risk but adds subprocess overhead.
