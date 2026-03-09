# Sprint 006 Draft (Codex): AgentChatTab Tests + CLI/API Mode-Switch Coverage

## Sprint Goal
Add deterministic test coverage for the chat UI layer (`AgentChatTab`) and mode-switch lifecycle behavior so we can safely support switching agents between CLI and API access modes without UI regressions.

## Scope

### In Scope
- Add unit tests for `AgentChatTab` event-handling behavior in a JSDOM environment.
- Polyfill the Obsidian DOM helper methods used by `AgentChatTab` (`createDiv`, `createEl`, `createSpan`, `addClass`, `removeClass`, `empty`) for test runtime.
- Verify `AgentChatTab` behavior on all runner events it consumes:
  - `token`
  - `complete`
  - `error`
  - `fileOpStart`
  - `fileOpResult`
  - `stderr` (status update path)
- Verify chat send flow and context handoff (`runner.run(history, context)` with active-file read handling).
- Verify equivalent behavior with both a CLI-style runner stub and API-style runner stub implementing `AgentExecutionRunner`.
- Add mode-switch coverage in `runnerFactory` tests for same agent id switching `accessMode: "cli" -> "api"` and `"api" -> "cli"`.
- Keep all existing test suites green.

### Out of Scope
- New production features or settings UI changes.
- Re-testing streaming parser internals already covered in `AgentRunner`/`AgentApiRunner` integration tests.
- Obsidian E2E automation changes.
- Conversation persistence changes.

## Current-State Baseline
- `AgentChatTab` has meaningful UI logic but no direct tests.
- Existing tests heavily cover runner internals (`AgentRunner`, `AgentApiRunner`, `runnerFactory`) and E2E API chat behavior.
- `AgentChatTab` already includes `data-testid` hooks and uses Obsidian DOM helper extensions, which are not available in Node by default.
- `createRunner` already supports both CLI and API branches and URL/model validation.

## Design Decisions
1. Introduce a dedicated Vitest config for chat-tab DOM tests (`jsdom` environment).
- Rationale: keeps existing node-based unit/integration suites unchanged and avoids global environment side effects.

2. Use an EventEmitter-backed fake runner for `AgentChatTab` tests.
- Rationale: validates the UI contract against the `AgentExecutionRunner` interface without process/network complexity.

3. Keep mode-switch verification at factory level, not full `AgentSidebarView` DOM tests in this sprint.
- Rationale: intent requires confidence in switching behavior; factory-level assertions are high signal and low brittleness.

4. Add a focused Obsidian DOM polyfill in test setup only.
- Rationale: no production code changes required for testability.

## Implementation Plan

### Phase 1: JSDOM Harness + Obsidian DOM Polyfill

**Files**
- `vitest.chat.config.ts` (new)
- `tests/chat/setup/domPolyfills.ts` (new)
- `tests/integration/helpers/obsidianStub.ts` (reuse existing alias target)

**Tasks**
- [ ] Create `vitest.chat.config.ts` with:
  - `environment: "jsdom"`
  - include pattern targeting chat unit tests
  - same `obsidian` alias to `tests/integration/helpers/obsidianStub.ts`
  - setup file registration for DOM polyfills
- [ ] Implement polyfills for methods used by `AgentChatTab`:
  - `HTMLElement.prototype.createDiv`
  - `HTMLElement.prototype.createEl`
  - `HTMLElement.prototype.createSpan`
  - `HTMLElement.prototype.addClass`
  - `HTMLElement.prototype.removeClass`
  - `HTMLElement.prototype.empty`
- [ ] Ensure polyfill signatures support current call shapes used in source (`cls`, `text`, `attr`).

### Phase 2: AgentChatTab Test Fixtures

**Files**
- `tests/chat/helpers/fakeRunner.ts` (new)
- `tests/chat/helpers/fakeApp.ts` (new)

**Tasks**
- [ ] Build `FakeExecutionRunner` (`EventEmitter` + `run`/`dispose`) that records run calls and allows scripted event emission.
- [ ] Add optional labels (`kind: "cli" | "api"`) for readability in parametrized tests.
- [ ] Build minimal fake `app` object for `AgentChatTab`:
  - `workspace.getActiveFile()`
  - `vault.read()`
  - `vault.adapter.basePath`
- [ ] Add shared helper to instantiate `AgentChatTab` with a real container element and deterministic detection/plugin inputs.

### Phase 3: AgentChatTab Event Contract Tests

**Files**
- `tests/chat/agent-chat-tab.chat.test.ts` (new)

**Tasks**
- [ ] Parametrize core tests over runner kind (`cli` and `api`) to verify identical UI outcomes.
- [ ] Add tests for:
  - initial empty-state rendering
  - sending a message appends user message and creates streaming assistant message
  - `token` appends streamed content to assistant message
  - `stderr` updates status line while streaming
  - `complete` finalizes streaming message and clears busy state
  - `error` finalizes streaming state and renders error card
  - `fileOpStart` creates pending file-op card
  - `fileOpResult` replaces pending card with final file-op card
- [ ] Add tests for send flow constraints:
  - empty input does not call `runner.run`
  - send disabled while streaming
- [ ] Add tests for context behavior:
  - includes `vaultPath` in context payload
  - includes `activeFileContent` when read succeeds
  - truncates active file content to `MAX_CONTEXT_BYTES`
  - gracefully handles vault read failure

### Phase 4: Mode-Switch Coverage

**Files**
- `tests/integration/runner-factory.integration.test.ts`

**Tasks**
- [ ] Add tests that call `createRunner` twice for the same agent (`claude`) with different access modes and assert returned class types switch correctly:
  - first CLI then API
  - first API then CLI
- [ ] Assert API branch still succeeds with settings-level API key override (`agentConfig.apiKey`) to avoid dependence on shell env detection.
- [ ] Keep tests process-isolated assumptions intact (`pool: "forks"`).

### Phase 5: Script Wiring + Validation

**Files**
- `package.json`

**Tasks**
- [ ] Add `test-chat` script: `vitest run --config vitest.chat.config.ts`
- [ ] Verify full test matrix:
  - `npm run test`
  - `npm run test-chat`
  - `npm run test-integration`
- [ ] Run `npm run build` to ensure no type regressions.

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `vitest.chat.config.ts` | Create | Isolated JSDOM suite for chat-tab tests |
| `tests/chat/setup/domPolyfills.ts` | Create | Obsidian DOM helper polyfills for JSDOM |
| `tests/chat/helpers/fakeRunner.ts` | Create | EventEmitter runner stub implementing `AgentExecutionRunner` |
| `tests/chat/helpers/fakeApp.ts` | Create | Minimal app/vault stubs for context + active-file behaviors |
| `tests/chat/agent-chat-tab.chat.test.ts` | Create | Main `AgentChatTab` behavioral tests |
| `tests/integration/runner-factory.integration.test.ts` | Modify | Mode-switch branch coverage for CLI/API transitions |
| `package.json` | Modify | Add dedicated `test-chat` script |

## Acceptance Criteria
1. `AgentChatTab` is instantiable and testable in JSDOM with no production source changes.
2. Tests pass for all consumed runner events (`token`, `complete`, `error`, `fileOpStart`, `fileOpResult`, `stderr`).
3. The same chat-tab expectations pass for both CLI-style and API-style fake runners.
4. Runner-factory integration tests prove same-agent mode switching returns the correct runner type in both directions.
5. Existing unit/integration/E2E suites remain unaffected.

## Risks and Mitigations
1. Obsidian DOM method polyfill misses an edge behavior used by `AgentChatTab`.
- Mitigation: keep polyfill surface minimal and aligned to exact call patterns from source; expand only when a test demonstrates need.

2. JSDOM timing around async `sendMessageContent` causes flaky assertions.
- Mitigation: use deterministic fake runner hooks and await explicit DOM states rather than fixed sleeps.

3. Mode-switch tests can become brittle if they rely on shell env resolution cache behavior.
- Mitigation: prefer settings-level API key in switch tests and keep env-sensitive cases in existing dedicated tests.

## Open Questions
1. Should `AgentSidebarView` tab rebuild lifecycle be directly tested in this sprint, or deferred if factory-level mode-switch coverage is sufficient?
2. Do we want to fold the new chat tests into the default `npm test` include pattern later, or keep them isolated behind `test-chat` for faster local iteration?
