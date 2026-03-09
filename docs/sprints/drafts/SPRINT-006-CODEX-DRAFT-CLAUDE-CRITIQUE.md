# Sprint 006 Codex Draft Critique (by Claude)

## What Codex Got Right That My Draft Missed

1. **Critical test flow issue**: Codex correctly identified that emitting `token`/`complete`/`error` before triggering a send is insufficient. `AgentChatTab.createStreamingMessage()` is only called from `sendMessageContent()`; emitting `token` with no active streaming message means `this.currentAssistantMsgEl` is null and the content appends to nothing. Every event-flow test must trigger `handleSend()` first (via input + button or direct call) before emitting runner events. This is the most important correction to accept.

2. **`stderr` event missing**: My draft omitted `stderr` coverage. `AgentChatTab` explicitly listens to `stderr` to update the status element during streaming. One test for this path is warranted.

3. **Alias reuse**: Codex correctly notes that `obsidianStub.ts` already exists and can be aliased. My draft proposed creating a new `mockObsidianModule.ts`, adding redundant code. Reusing the integration stub (with alias) is cleaner.

4. **Settings-level API key in mode-switching tests**: Using `agentConfig.apiKey` in the factory mode-switching tests avoids the shell env cache problem. My draft relied on the `beforeAll` env var setup, which is process-scoped — a subtler dependency. Codex's approach is more robust.

## Codex Draft Weaknesses

1. **Misses the user-confirmed lifecycle test**: The human planner explicitly requested a destroy/recreate lifecycle test — create `AgentChatTab` with a CLI runner, call `destroy()`, then create a new `AgentChatTab` with an API runner on the same container element, verify both work. Codex defers this ("Open Question 1") without addressing the user's stated goal. This must be in P0.

2. **`tests/chat/` directory breaks project conventions**: The project has `tests/integration/` and `tests/e2e/`. A `tests/chat/` directory is inconsistent — it names tests by feature rather than by test layer. `tests/unit/` is more consistent with the existing pattern and clearer about what kind of test it is.

3. **Makefile omission**: Codex says Makefile edits are unnecessary. However, every test suite in this project has a Makefile target (`test`, `test-integration`, `test-e2e`, `test-all`). Omitting `test-unit` (or `test-chat`) from the Makefile breaks the established convention and makes `make test-all` incomplete. This should be P0.

4. **Parametrized test pattern over-engineering**: Codex proposes parametrizing core tests over `kind: "cli" | "api"`. Since both stubs are identical EventEmitter implementations (the whole point of the `AgentExecutionRunner` interface is runner-type agnosticism), parametrization adds ceremony without value. A simpler approach: one helper test that creates the tab with a labeled CLI stub, one with a labeled API stub, both asserting the same behavior — this makes the equivalence explicit and readable without test framework parametrization overhead.

5. **Context payload tests in P0**: Codex promotes context injection tests to P0 (vaultPath, activeFileContent, truncation, read failure). While valid, these paths are simple `JSON.stringify` calls; a read failure just sets `activeFileContent = null`. The risk is low and P1 is the right tier.

## Choices I'd Defend from My Draft

- **`tests/unit/` directory**: Consistent with project's layer-based test directory naming.
- **Makefile target**: Required for `make test-all` completeness; not optional.
- **P1 tier for context tests**: The context-building path is minimal; P0 is for streaming event handling and mode-switching.
- **Destroy/recreate lifecycle test in P0**: User explicitly confirmed this.

## Summary

Codex's draft is architecturally aligned and provides two important corrections: the send-first test flow requirement and the `stderr` event gap. Both must be incorporated into the final sprint. The naming (`tests/chat/` vs `tests/unit/`), Makefile omission, and lifecycle test gap are weaknesses to avoid in the merge.
