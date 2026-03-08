# Sprint 003 Draft (Codex): Integration Test Suite

## Sprint Goal
Add a deterministic, Node-only integration test suite that validates multi-component behavior for the highest-risk runtime paths, runnable via `make test-integration` and `npm run test-integration`, without requiring Obsidian runtime, real API keys, or installed agent CLIs.

## Scope

### In Scope
- Create a separate integration test suite (separate directory and config from existing unit tests).
- Add `npm run test-integration` script in `package.json`.
- Add `test-integration` target in `Makefile`.
- Add integration coverage for three highest-risk subsystems:
  - streaming parser behavior at chunk boundaries (`:::file-op` protocol)
  - vault path traversal and canonical path enforcement in file operations
  - runner selection (`runnerFactory`) across CLI/API/error paths
- Include deterministic integration tests for `AgentApiRunner` timeout/abort behavior via mock provider stream.
- Include deterministic integration tests for `AgentDetector` cache + detection flow with graceful skip for environment-dependent checks.

### Out of Scope
- UI integration tests (`AgentSidebarView`, `AgentChatTab`, settings rendering).
- Live provider HTTP integration (Anthropic/OpenAI/Google network calls).
- End-to-end Obsidian app harness.
- Rewriting existing unit tests unless overlap must be removed.

## Current-State Baseline
- Unit tests exist under `src/__tests__/**/*.test.ts` and are run by `npm test` via `vitest.config.ts`.
- No dedicated integration test directory or integration-specific Vitest config exists.
- `Makefile` has `test` target only; no `test-integration` target.
- Core runtime pieces to integrate-test are present:
  - `AgentRunner` streaming parser + file-op interception
  - `AgentApiRunner` streaming parser + inactivity timeout
  - `FileOperationsHandler` canonical path checks against vault root
  - `runnerFactory` mode/capability selection
  - `AgentDetector` detection/cache behavior

## Integration Test Boundary (Locked)
Integration tests for this sprint follow this rule:
- Tests must exercise at least two real components together, or
- must involve real subprocess/filesystem behavior not reducible to a pure function test.

This keeps unit tests in `src/__tests__` and concentrates cross-component behavior in a separate suite.

## Proposed Test Layout

```text
tests/
└── integration/
    ├── fixtures/
    │   └── fake-agent.mjs              # deterministic stdout/stderr streamer
    ├── helpers/
    │   ├── mockObsidian.ts             # vi.mock("obsidian") classes + temp-dir vault bridge
    │   ├── mockVault.ts                # app.vault + fileManager over real temp filesystem
    │   └── streamFixtures.ts           # reusable chunked :::file-op payload builders
    ├── agent-runner.integration.test.ts
    ├── agent-api-runner.integration.test.ts
    ├── file-operations.integration.test.ts
    ├── runner-factory.integration.test.ts
    ├── agent-detector.integration.test.ts
    └── shell-env.integration.test.ts
vitest.integration.config.ts
```

Notes:
- Unit tests remain untouched in `src/__tests__`.
- Integration tests run with their own include pattern and setup hooks.

## Tooling Changes

### `package.json`
Add script:
- `"test-integration": "vitest run -c vitest.integration.config.ts"`

### `Makefile`
- Add `.PHONY` entry for `test-integration`.
- Add target:
  - `test-integration: npm run test-integration`

### `vitest.integration.config.ts` (new)
- `environment: "node"`
- `include: ["tests/integration/**/*.integration.test.ts"]`
- setup file for global `vi.mock("obsidian")` support.
- conservative test timeout defaults suitable for subprocess and timeout-path tests.

## Test Plan by Subsystem

### 1) Streaming Parser Integration (`AgentRunner`, `AgentApiRunner`)

#### `agent-runner.integration.test.ts`
Use a real subprocess (`process.execPath` + `fake-agent.mjs`) to emit controlled chunk sequences.

Scenarios:
1. `:::file-op` opener split across chunks still intercepts and executes once.
2. close delimiter split across chunks still intercepts and executes once.
3. multiple file-op blocks in one stream are handled in order.
4. malformed JSON in a file-op block is surfaced as plain token text (no crash).
5. plain text before/after file-op blocks is emitted via `token` events intact.

Assertions:
- exact `fileOpStart`/`fileOpResult` event counts and order.
- output token stream excludes intercepted file-op JSON for valid blocks.
- malformed block preserved in user-visible token stream.

#### `agent-api-runner.integration.test.ts`
Use a stub `ProviderAdapter` stream generator with deterministic token cadence.

Scenarios:
1. split file-op delimiters across provider tokens.
2. inactivity timeout path (`30s`) with fake timers to avoid wall-clock delay.
3. runner `dispose()` aborts stream and no `complete` is emitted after disposal.
4. malformed file-op JSON does not crash stream handling.

Assertions:
- same event contract as CLI path (`token`, `fileOpStart`, `fileOpResult`, `complete`, `error`).
- timeout emits expected error once.
- dispose path is deterministic and leak-free.

### 2) Vault Path Guard + CRUD Integration (`FileOperationsHandler`)

#### `file-operations.integration.test.ts`
Use mocked Obsidian classes over a real temporary directory for canonical path behavior.

Scenarios:
1. write creates parent folders and file; read returns written content.
2. rename/move updates target path correctly.
3. list returns file/folder entries with expected shape.
4. empty path is rejected with explicit error.
5. traversal input (`../outside.md`) is rejected.
6. normalized traversal-equivalent paths resolving outside root are rejected.
7. delete cancellation path returns cancelled result without mutation.

Assertions:
- operation results align with `FileOpResult` contract.
- no filesystem writes outside temp vault root.

### 3) Runner Selection Integration (`runnerFactory`)

#### `runner-factory.integration.test.ts`
Create fabricated settings+detection matrices with realistic `FileOperationsHandler` stubs.

Scenarios:
1. CLI selected + installed -> returns `AgentRunner`.
2. API selected + key present -> returns `AgentApiRunner`.
3. CLI selected + missing binary -> error runner emits error.
4. API selected + missing key -> error runner emits error.
5. invalid selected model falls back to provider default model.
6. unavailable provider/adapter edge paths produce deterministic errors.

Assertions:
- concrete runner type by behavior and event emissions.
- no silent fallback that hides misconfiguration.

### 4) Detection + Shell Environment Integration (`AgentDetector`, `shellEnv`)

#### `agent-detector.integration.test.ts`
Scenarios:
1. cache lifecycle: first detect populates cache, `clearCache()` resets, detect repopulates.
2. API key variable resolution prefers namespaced var and captures found var.
3. API-only provider (Gemini) skips CLI binary detection path.
4. real binary detection smoke checks gated with `describe.skipIf(...)` when binaries absent.

#### `shell-env.integration.test.ts`
Scenarios:
1. fallback to `process.env` on shell resolution failure.
2. known injected env key appears in resolved map.

Assertions:
- deterministic behavior for mocked failure paths.
- environment-dependent checks skip rather than fail when prerequisites missing.

## Determinism Strategy
- No network calls in integration tests.
- No dependence on installed CLIs except explicitly guarded smoke checks.
- Use temp directories per test file/suite with cleanup in `afterEach`/`afterAll`.
- Use fake timers for inactivity timeout tests.
- Keep all fake agent output deterministic and fixture-driven.

## Incremental Execution Plan

### Phase 1: Harness and Wiring
- Add `vitest.integration.config.ts`.
- Add `npm run test-integration`.
- Add `make test-integration`.
- Add integration setup helpers (`mockObsidian`, temp vault utilities).

### Phase 2: File Operations + Runner Factory
- Implement `file-operations.integration.test.ts`.
- Implement `runner-factory.integration.test.ts`.
- Validate stable pass locally.

### Phase 3: Streaming Parser Coverage
- Implement fake agent fixture script.
- Add `agent-runner.integration.test.ts` for subprocess streaming parser behavior.
- Add `agent-api-runner.integration.test.ts` for provider-stream behavior and timeout.

### Phase 4: Detection + Shell Env
- Add `agent-detector.integration.test.ts`.
- Add `shell-env.integration.test.ts`.
- Add skip guards for environment-dependent checks.

### Phase 5: Verification and Hardening
- Run `npm test` to confirm existing unit suite unaffected.
- Run `npm run test-integration` and `make test-integration`.
- Run `npm run build` for type-check + bundle sanity.
- Stabilize any flaky timing/assertion behavior.

## Acceptance Criteria
1. `npm run test-integration` executes only integration tests and passes.
2. `make test-integration` executes integration tests and passes.
3. Existing `npm test` continues to run unit tests only and passes.
4. Integration suite includes deterministic tests for:
   - chunk-boundary `:::file-op` parsing
   - path traversal rejection
   - runner selection (CLI/API/error)
5. `AgentApiRunner` inactivity timeout path is covered with fake timers.
6. Environment-dependent detection tests skip gracefully when prerequisites are absent.
7. `npm run build` passes with no TypeScript errors.

## Verification Matrix
- Split opener across chunks -> one valid file-op execution.
- Split closer across chunks -> one valid file-op execution.
- Multiple file-op blocks in single stream -> ordered execution and results.
- Malformed file-op JSON -> no crash, emitted as plain token text.
- `../` path input -> rejected with outside-root error.
- Empty path -> rejected with `Path cannot be empty`.
- API mode selected + missing key -> error runner emits clear key-missing error.
- CLI mode selected + missing binary -> error runner emits clear binary-missing error.
- API runner stalls beyond timeout -> single timeout error emitted.
- Detector cache clear -> subsequent detect repopulates cache.

## Risks and Mitigations
1. Obsidian mocks drift from runtime API shape.
- Mitigation: keep mocks minimal and targeted to methods actually invoked by tested modules.

2. Timing flakiness in stream/timeout tests.
- Mitigation: fixture-driven token cadence + fake timers + explicit await points.

3. Overlap between unit and integration tests causes maintenance noise.
- Mitigation: keep integration tests focused on cross-component behavior; leave pure function assertions in unit tests.

4. Real-binary smoke checks fail in CI/dev machines without installed tools.
- Mitigation: hard skip guards with explicit skip reason when binary is unavailable.

## Definition of Done
- Integration harness and command wiring are merged.
- Integration tests are in a separate directory/config from unit tests.
- High-risk subsystem coverage is present and passing.
- Unit tests remain green and unaffected.
- Build succeeds.
- No test requires Obsidian app runtime, real provider network access, or mandatory local CLI installs.

## Open Decisions
1. Directory naming preference: `tests/integration/` vs `src/integration-tests/`.
2. Whether to include real-binary smoke tests by default or gate behind env flag.
3. Whether to add integration-suite coverage reporting now or defer to a future CI sprint.
