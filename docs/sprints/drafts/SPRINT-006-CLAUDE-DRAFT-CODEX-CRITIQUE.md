# Sprint 006 Claude Draft Critique (by Codex)

## Summary
Claude's draft is directionally strong and mostly aligned with the sprint intent. The main issues are a few test-design mismatches with current `AgentChatTab` control flow and some avoidable scope/config complexity.

## What Claude Draft Does Well
- Picks the right core strategy: JSDOM + Obsidian DOM polyfills + EventEmitter runner stubs.
- Keeps production-code risk low and focuses on missing coverage in the UI glue layer.
- Correctly scopes mode-switching verification to `createRunner` sequence behavior.
- Uses explicit, testable DoD criteria.

## Critical Issues

1. Token/complete/error event tests are specified as direct emits without creating streaming state first.
- In current `AgentChatTab`, streaming message creation happens in `sendMessageContent(...)`, not in `token`/`complete` handlers.
- Emitting `token` before a send does not create the assistant message; it only appends to `currentAssistantContent` and updates existing streaming content if present.
- Recommendation: require each event-flow test to trigger send first (via textarea + click/Enter or direct method call), then emit runner events and assert DOM transitions.

2. Several behavioral assertions are impossible unless `runner.run()` is exercised.
- Draft includes checks like "send button re-enabled after complete/error" and history-finalization assertions, but those states depend on `setStreaming(true)` from send flow.
- If tests only emit events, they can produce false confidence or flaky expectations.
- Recommendation: make `runner.run` invocation and pending-stream setup part of the base fixture for completion/error/file-op tests.

## Medium Priority Gaps

1. `stderr` event handling is omitted from planned coverage.
- `AgentChatTab` explicitly listens for `stderr` and writes status text during streaming.
- Recommendation: add one explicit `stderr` test to validate status updates while stream is active.

2. Config/module-stub plan is redundant and internally split.
- Phase 1 `vitest.unit.config.ts` snippet omits `obsidian` alias; Phase 3 introduces separate `vi.mock("obsidian")`/alias work.
- Repo already uses a stable alias pattern (`tests/integration/helpers/obsidianStub.ts`) that can be reused directly.
- Recommendation: pick one approach (prefer alias reuse), remove the extra mock-module phase.

3. Makefile changes are likely unnecessary for sprint objective.
- Adding `test-unit` script in `package.json` is sufficient for local/CI execution.
- Recommendation: treat Makefile edits as optional follow-up, not P0 scope.

4. Deferred context-injection tests leave a meaningful chat-tab path unverified.
- `AgentChatTab` builds `context` from `vault.adapter.basePath` and active-file content (including truncation/error handling).
- Recommendation: include at least one positive and one read-failure context test in P0 to cover this logic.

## Suggested Edits to Claude Draft
1. Rewrite event tests to follow a valid flow: send first, then emit runner events, then assert DOM/history/state.
2. Add explicit `stderr` coverage.
3. Collapse module resolution strategy to a single alias-based approach.
4. Move `Makefile` edits from must-ship to optional.
5. Promote minimal context payload tests from deferred to must-ship.

## Verdict
Implementation-ready with modest corrections. The overall architecture is solid, but the test flow needs to be anchored to real `AgentChatTab` streaming lifecycle to avoid false positives.
