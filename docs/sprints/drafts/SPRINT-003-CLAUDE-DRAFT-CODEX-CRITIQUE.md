# Sprint 003 Claude Draft Critique (by Codex)

## Summary
Claude's draft is strong on motivation and detailed parser/file-op test scenarios. The main issues are execution mismatches with current code, one direct conflict with sprint constraints, and a missing first-class plan for runner selection testing.

## What Claude Draft Does Well
- Clearly defines integration-test boundary (multi-component or real subprocess/filesystem).
- Prioritizes the right high-risk behaviors: chunk-boundary parser handling and path traversal guard.
- Uses deterministic techniques (fake timers, fake subprocess, temp directories).
- Keeps API/network and UI testing correctly out of scope.

## Critical Issues

1. Script name conflicts with sprint requirement.
- Draft adds `"test:integration"`, but sprint intent explicitly requires `npm run test-integration`.
- Recommendation: use `"test-integration": "vitest run -c vitest.integration.config.ts"` and wire Make target to that exact script.

2. Missing dedicated runner-factory integration coverage.
- Sprint intent/success criteria call out runner selection as a top-three risk area, but draft plan has no `runnerFactory` integration test file/phase.
- Recommendation: add `runner-factory.integration.test.ts` with CLI/API/error runner-path assertions.

3. Mock design does not match `FileOperationsHandler` dependencies.
- Draft's MockVault API sketch focuses on vault methods, but current handler also depends on:
  - `app.fileManager.trashFile`
  - `app.fileManager.renameFile`
  - Obsidian classes (`TFile`, `TFolder`) and `Notice` DOM surface for delete confirm
- Recommendation: expand mock layer to include `fileManager`, `TFile`/`TFolder` compatibility, and deterministic `confirmDelete` handling.

4. `AgentApiRunner` provider mocking path is underspecified against current class design.
- `AgentApiRunner` currently hard-wires provider creation in constructor (`createProvider`) with no dependency injection entry point.
- Recommendation: either plan a small testability seam (provider injection) or specify the exact monkey-patch strategy; otherwise tests are not directly implementable as written.

## Medium Priority Gaps

1. Directory separation is weaker than it should be.
- Draft nests integration tests under `src/__tests__/integration/`; this is technically separate, but still couples discovery to unit-test tree.
- Recommendation: prefer top-level `tests/integration/` for cleaner isolation and future CI targeting.

2. `AgentDetector` strategy conflates deterministic checks and environment-smoke checks.
- Plan says "skip if any binary missing" which can hide deterministic checks that should always run.
- Recommendation: split deterministic tests (always run) from optional real-binary smoke tests (`describe.skipIf(...)`).

3. Shell environment integration is left as an open question.
- Intent explicitly includes `shellEnv.ts` in relevant codebase areas.
- Recommendation: include at least one deterministic fallback test for `resolveShellEnv()` instead of leaving this undecided.

## Suggested Edits to Claude Draft
1. Rename script throughout from `test:integration` to `test-integration`.
2. Add a dedicated `runner-factory.integration.test.ts` phase with CLI/API/error cases and model fallback behavior.
3. Update MockVault/MockApp spec to include `fileManager`, `TFile`/`TFolder`, and delete-confirmation path support.
4. Clarify `AgentApiRunner` testability approach (DI seam or explicit patch strategy).
5. Move integration suite to `tests/integration/` (or justify staying under `src/__tests__/integration` with strict include rules).
6. Convert `shellEnv.ts` from open question to explicit low-cost integration coverage.

## Verdict
Claude's draft is directionally good and close, but it is not fully executable against the current code without the runnerFactory gap, script-name correction, and mock/testability alignment fixes above.
