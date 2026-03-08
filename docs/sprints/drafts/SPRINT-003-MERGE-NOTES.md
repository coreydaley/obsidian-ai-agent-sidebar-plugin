# Sprint 003 Merge Notes

## Claude Draft Strengths
- Clear integration test boundary definition (multi-component or real subprocess/filesystem)
- Comprehensive parser edge case coverage: chunk-boundary splits, malformed JSON, multiple blocks, mixed text
- Correct determinism strategy: fake timers for timeout, fake subprocess for streaming
- Right set of path traversal test cases (including rename target validation)
- Correctly deferred provider HTTP tests and UI tests as out-of-scope

## Codex Draft Strengths
- Proposed top-level `tests/integration/` directory for cleaner isolation from unit tests
- Added `runner-factory.integration.test.ts` — a significant gap in my draft
- Proposed `streamFixtures.ts` helper for reusable chunked file-op payload builders
- Added `shell-env.integration.test.ts` as low-cost coverage of a critical utility
- Correctly split deterministic vs smoke/environment-dependent tests in `AgentDetector`
- Named script `test-integration` (not `test:integration`) — matching sprint intent requirement

## Valid Critiques Accepted

1. **Script name**: Must be `"test-integration"` in package.json (not `"test:integration"`) to match `npm run test-integration` requirement. My draft used the wrong key.

2. **Missing runner-factory integration tests**: Added `runner-factory.integration.test.ts` with CLI/API/error paths and model fallback behavior.

3. **MockApp needs fileManager**: After reading full `FileOperationsHandler` source, confirmed it uses `app.fileManager.trashFile` (delete) and `app.fileManager.renameFile` (rename). Mock must include `fileManager` with these methods.

4. **Notice and DOM stubs**: `confirmDelete` uses `new Notice(...)` with DOM element creation. Mock for `obsidian` module must include `Notice` stub with `messageEl` (supporting `createEl`, `createDiv`) and a `hide()` method. Integration tests can auto-confirm by wiring `confirmBtn.onclick()`.

5. **TFile/TFolder must be real classes for instanceof**: Since `FileOperationsHandler` uses `file instanceof TFile` and `target instanceof TFolder`, the `vi.mock('obsidian')` must export actual classes (not plain objects) so instanceof checks work.

6. **AgentApiRunner testability seam**: Constructor hard-wires `createProvider()`. A minimal DI seam is needed: add an optional `provider?: ProviderAdapter` parameter to the constructor. This is a production code change (minor, ~2 lines) justified by testability. No behavior change for existing callers.

7. **Directory location**: Use top-level `tests/integration/` for cleaner separation. Unit tests stay in `src/__tests__/`. This requires updating `vitest.integration.config.ts` include pattern.

8. **AgentDetector deterministic vs smoke**: Split tests clearly — deterministic path (cache lifecycle, API key resolution logic, API-only provider skip) always runs; real binary detection (`which claude` etc.) wrapped in `describe.skipIf(...)`.

9. **shellEnv integration test**: Add `shell-env.integration.test.ts` with fallback and env-key resolution scenarios.

## Critiques Rejected

None. All Codex critiques were valid or at least harmless to accept.

## Interview Refinements Applied

- `vi.mock('obsidian')` approach confirmed — no production code refactoring needed except AgentApiRunner DI seam
- Fake agent via `process.execPath` + temp `.mjs` script confirmed
- Provider HTTP tests out of scope confirmed

## Final Decisions

1. Test directory: `tests/integration/` (top-level, not under `src/__tests__/`)
2. Obsidian mock: `vi.mock('obsidian')` in vitest setup file; TFile/TFolder as real exportable classes
3. AgentApiRunner: add optional `provider?: ProviderAdapter` constructor param for testability
4. Script key: `"test-integration"` in package.json
5. Makefile target: `test-integration` (no extra indirection)
6. Separate helpers: `mockObsidian.ts` (vi.mock classes + MockApp), `mockVault.ts` (temp-dir vault), `streamFixtures.ts` (chunked payload builders), `fakeAgent.ts` (temp script factory)
7. 6 test files total: AgentRunner, AgentApiRunner, FileOperationsHandler, runnerFactory, AgentDetector, shellEnv
