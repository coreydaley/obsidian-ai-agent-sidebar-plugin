# Sprint 006: AgentChatTab Unit Tests + CLI/API Mode-Switching Coverage

**Status:** Planned

## Overview

Sprint 005 completed the API mock infrastructure and E2E chat tests. CLI agents have been mockable via `writeFakeScript` since Sprint 003. The remaining gap is `AgentChatTab` — the event-binding layer between runners and the DOM — which has no unit tests. The same applies to the mode-switching lifecycle: does `createRunner` correctly return a different runner type when `accessMode` changes for the same agent?

This sprint answers "yes" to the feasibility question and implements the coverage:

1. **AgentChatTab unit tests**: Run under vitest JSDOM. A setup file polyfills Obsidian's `HTMLElement` extensions (`createEl`, `createDiv`, `createSpan`, `addClass`, `removeClass`, `empty`). Tests use `EventEmitter`-backed runner stubs — no subprocesses, no HTTP. All event-flow tests trigger `sendMessageContent` first (via button click) because `AgentChatTab.createStreamingMessage()` is only invoked from the send path; emitting `token` or `complete` without an active streaming message is a no-op.

2. **Mode-switching tests**: Added to `runner-factory.integration.test.ts`. Same agentId, different `accessMode` → different runner type from `createRunner`. Tests use settings-level `apiKey` to avoid the shell env resolution cache. Four sequences: cli-only, api-only, cli→api, api→cli.

3. **Destroy/recreate lifecycle**: Create `AgentChatTab` with a CLI runner stub → destroy → create new `AgentChatTab` on the same container with an API runner stub → verify both work correctly. Documents that the tab lifecycle is runner-type-agnostic.

No production source changes required.

## Use Cases

1. **CLI runner emits tokens → appear in chat DOM**: `AgentChatTab` handles `token` events from a CLI-style runner and updates the streaming message content.
2. **API runner emits tokens → identical behavior**: Same test, API-style runner stub. Documents runner-type agnosticism.
3. **complete event → message finalized**: Streaming class removed, send button re-enabled.
4. **error event → error card rendered**: `[data-testid="ai-agent-chat-error"]` appears with the error message.
5. **fileOpStart + fileOpResult → file op cards**: Pending card appears and is replaced by the result card.
6. **stderr → status update**: Status element text updated during streaming.
7. **Mode switch (cli → api)**: `createRunner("claude", { accessMode: "cli" })` → `AgentRunner`; `createRunner("claude", { accessMode: "api" })` → `AgentApiRunner`. Second call is independent.
8. **Destroy/recreate**: Tab destroyed with CLI runner, recreated with API runner on same container — both work.

## Architecture

```
tests/unit/
├── helpers/
│   └── obsidianDomPolyfill.ts      Polyfill HTMLElement with Obsidian extensions
└── agent-chat-tab.unit.test.ts     AgentChatTab event handling + lifecycle tests

vitest.unit.config.ts               New config: jsdom env, unit test pattern, obsidian alias
```

Existing file modified:
```
tests/integration/runner-factory.integration.test.ts   + describe("mode switching") block
```

### Obsidian DOM Polyfill

`AgentChatTab` uses these Obsidian-specific `HTMLElement` methods:

| Method | Polyfill |
|--------|---------|
| `empty()` | `this.innerHTML = ""` |
| `addClass(cls)` | `this.classList.add(cls)` |
| `removeClass(cls)` | `this.classList.remove(cls)` |
| `createEl(tag, opts?)` | `document.createElement(tag)` + apply `cls`, `text`, `attr`; append to `this` |
| `createDiv(opts?)` | `this.createEl("div", opts)` |
| `createSpan(opts?)` | `this.createEl("span", opts)` |

All other APIs (`textContent`, `querySelector`, `scrollTop`, `addEventListener`, `disabled`, `value`) are standard DOM available in JSDOM.

### MockRunner

```typescript
class MockRunner extends EventEmitter implements AgentExecutionRunner {
  runCalls: Array<{ messages: ChatMessage[]; context: string }> = [];
  async run(messages: ChatMessage[], context: string): Promise<void> {
    this.runCalls.push({ messages, context });
    // Test controls events by calling runner.emit() directly
  }
  dispose(): void {}
}
```

### Key Test Pattern: Send First

All event-flow tests (token, complete, error, fileOp, stderr) must trigger the send flow before emitting events:

```typescript
// Correct — creates streaming message before emitting events
async function triggerSend(container: HTMLElement, runner: MockRunner): Promise<void> {
  const input = container.querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
  const button = container.querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
  input.value = "hello";
  button.click();
  await new Promise(r => setTimeout(r, 0)); // flush microtasks
}
```

Without this, `this.currentAssistantMsgEl` is null and token/complete/error handlers silently no-op.

### App + Plugin Stubs

```typescript
const mockApp = {
  workspace: { getActiveFile: () => null },
  vault: { read: async () => "", adapter: { basePath: "/test-vault" } },
} as unknown as App;

const mockPlugin = {
  settings: { debugMode: false },
} as unknown as AgentSidebarPlugin;

const mockDetection: AgentDetectionResult = {
  id: "claude" as AgentId,
  name: "Claude Code",
  command: "claude",
  path: "/usr/local/bin/claude",
  isInstalled: false,
  hasApiKey: false,
  apiKeyVar: "",
};
```

## Implementation Plan

### P0: Must Ship

#### Phase 1: vitest unit config (~10%)

**Files:**
- `vitest.unit.config.ts` — new
- `package.json` — add script
- `Makefile` — add target

**Tasks:**
- [ ] Create `vitest.unit.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";
  import path from "path";
  export default defineConfig({
    resolve: {
      alias: {
        obsidian: path.resolve(__dirname, "tests/integration/helpers/obsidianStub.ts"),
      },
    },
    test: {
      environment: "jsdom",
      include: ["tests/unit/**/*.unit.test.ts"],
      setupFiles: ["tests/unit/helpers/obsidianDomPolyfill.ts"],
    },
  });
  ```
- [ ] Add `"test-unit": "vitest run --config vitest.unit.config.ts"` to `package.json` scripts
- [ ] Add `test-unit` to Makefile `.PHONY` and add target:
  ```makefile
  test-unit:
  	npm run test-unit
  ```
- [ ] Add `test-unit` to the `test-all` target alongside `test`, `test-integration`, `test-e2e`

#### Phase 2: Obsidian DOM polyfill (~10%)

**Files:**
- `tests/unit/helpers/obsidianDomPolyfill.ts` — new

**Tasks:**
- [ ] Implement `obsidianDomPolyfill.ts`:
  ```ts
  // Polyfill Obsidian's HTMLElement extensions for JSDOM unit tests.
  // Methods mirror the Obsidian API surface used by AgentChatTab.
  // Known differences from real Obsidian: createEl does not support
  // all DomElementInfo fields (only cls, text, attr used by AgentChatTab).

  interface DomElementInfo {
    cls?: string;
    text?: string;
    attr?: Record<string, string | number>;
  }

  Object.defineProperties(HTMLElement.prototype, {
    empty: {
      value(this: HTMLElement) { this.innerHTML = ""; },
      configurable: true, writable: true,
    },
    addClass: {
      value(this: HTMLElement, cls: string) { this.classList.add(cls); },
      configurable: true, writable: true,
    },
    removeClass: {
      value(this: HTMLElement, cls: string) { this.classList.remove(cls); },
      configurable: true, writable: true,
    },
    createEl: {
      value(this: HTMLElement, tag: string, opts?: DomElementInfo): HTMLElement {
        const el = document.createElement(tag);
        if (opts?.cls) el.className = opts.cls;
        if (opts?.text) el.textContent = opts.text;
        if (opts?.attr) {
          for (const [k, v] of Object.entries(opts.attr)) {
            el.setAttribute(k, String(v));
          }
        }
        this.appendChild(el);
        return el;
      },
      configurable: true, writable: true,
    },
    createDiv: {
      value(this: HTMLElement, opts?: DomElementInfo) {
        return (this as unknown as { createEl: (t: string, o?: DomElementInfo) => HTMLElement })
          .createEl("div", opts);
      },
      configurable: true, writable: true,
    },
    createSpan: {
      value(this: HTMLElement, opts?: DomElementInfo) {
        return (this as unknown as { createEl: (t: string, o?: DomElementInfo) => HTMLElement })
          .createEl("span", opts);
      },
      configurable: true, writable: true,
    },
  });
  ```
- [ ] If `crypto.randomUUID()` is unavailable in the JSDOM environment, add to setup:
  ```ts
  if (!globalThis.crypto?.randomUUID) {
    let _id = 0;
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: () => `test-id-${_id++}` },
    });
  }
  ```

#### Phase 3: AgentChatTab unit tests (~55%)

**Files:**
- `tests/unit/agent-chat-tab.unit.test.ts` — new

**Tasks:**

Shared setup:
```ts
class MockRunner extends EventEmitter implements AgentExecutionRunner {
  runCalls: Array<{ messages: ChatMessage[]; context: string }> = [];
  async run(m: ChatMessage[], c: string) { this.runCalls.push({ messages: m, context: c }); }
  dispose() {}
}

async function triggerSend(container: HTMLElement): Promise<void> {
  const input = container.querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
  const btn = container.querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
  input.value = "test message";
  btn.click();
  await new Promise(r => setTimeout(r, 0));
}

let container: HTMLDivElement;
let runner: MockRunner;
let tab: AgentChatTab;

beforeEach(() => {
  container = document.createElement("div");
  runner = new MockRunner();
  tab = new AgentChatTab(container, runner, mockDetection, mockApp, mockPlugin);
});

afterEach(() => { tab.destroy(); });
```

- [ ] **Render tests**:
  - Test: constructor renders without throwing
  - Test: container has `.ai-sidebar-chat` class after render
  - Test: `[data-testid="ai-agent-chat-input"]` is present
  - Test: `[data-testid="ai-agent-chat-submit"]` is present
  - Test: empty state message visible in new tab

- [ ] **Send flow tests**:
  - Test: `triggerSend()` calls `runner.run()` exactly once
  - Test: send button is disabled while `runner.run()` is pending
  - Test: empty input does not call `runner.run()`
  - Test: user message element `[data-testid="ai-agent-chat-message-user"]` appears after send
  - Test: streaming assistant message `[data-testid="ai-agent-chat-message-assistant"]` appears after send

- [ ] **Token streaming tests** (all require `triggerSend()` first):
  - Test: `runner.emit("token", "Hello ")` → streaming message content element contains "Hello"
  - Test: three sequential `token` events accumulate into single content string
  - Test: status "Thinking…" element disappears after first token

- [ ] **`stderr` tests** (requires `triggerSend()` first):
  - Test: `runner.emit("stderr", "working...")` → status element text updated to "working..."

- [ ] **Completion tests** (requires `triggerSend()` first):
  - Test: `runner.emit("complete")` → streaming class removed from message element
  - Test: `runner.emit("complete")` → send button re-enabled
  - Test: `runner.emit("complete")` → `getHistory()` includes assistant message with accumulated content

- [ ] **Error tests** (requires `triggerSend()` first):
  - Test: `runner.emit("error", new Error("refused"))` → `[data-testid="ai-agent-chat-error"]` appears
  - Test: error element contains the error message text
  - Test: send button re-enabled after error

- [ ] **fileOp tests** (requires `triggerSend()` first):
  - Test: `runner.emit("fileOpStart", { op: "read", path: "test.md" })` → pending card `.ai-sidebar-fileop-card--pending` appears
  - Test: `runner.emit("fileOpResult", op, { ok: true, result: {} })` → pending card removed, result card present
  - Test: `runner.emit("fileOpResult", op, { ok: false, error: "Access denied" })` → op label has `--err` class

- [ ] **Duplicate send suppression**:
  - Test: click send button twice rapidly (second click while `runner.run()` is pending) → `runner.runCalls.length === 1` (button disabled prevents re-entrancy)
  - Test: press Enter twice in rapid succession → same — only one `run()` call

- [ ] **CLI/API runner equivalence tests**:
  - Test (CLI stub): create tab with MockRunner labeled as CLI-style → `triggerSend()` → `runner.emit("token", "hi")` → token in DOM
  - Test (API stub): create tab with identical MockRunner labeled as API-style → same flow → identical result
  - Test documents that `AgentChatTab` is runner-type-agnostic

- [ ] **Destroy/recreate lifecycle test**:
  - Create container; create tab with `cliRunner` (MockRunner); `triggerSend()`; `cliRunner.emit("complete")`; `tab.destroy()`
  - Verify `cliRunner` listener count drops to zero after destroy (no `"token"` or `"complete"` listener remaining)
  - Create new `AgentChatTab` on same container with `apiRunner` (new MockRunner); `triggerSend()`; `apiRunner.emit("token", "from api")`
  - Verify token appears in DOM; verify `apiRunner.runCalls.length === 1`
  - Verify `cliRunner` has no listeners — confirming old runner events do not leak into new tab

#### Phase 4: Mode-switching tests in runner-factory (~15%)

**Files:**
- `tests/integration/runner-factory.integration.test.ts` — modify (add describe block)

**Tasks:**
- [ ] Add `describe("mode switching")` after the existing `describe` blocks:
  ```ts
  describe("mode switching", () => {
    // Use settings-level apiKey to avoid shell env cache dependency
    function makeSettingsWithKey(agentId: AgentId, accessMode: AccessMode): PluginSettings {
      return { ...makeSettings(agentId, accessMode), agents: {
        ...makeSettings(agentId, accessMode).agents,
        [agentId]: { ...makeSettings(agentId, accessMode).agents[agentId], apiKey: "settings-key-for-switching-test" }
      }};
    }
  ```
  - Test: CLI-only — `createRunner("claude", { accessMode: "cli", isInstalled: true })` → `AgentRunner`
  - Test: API-only — `createRunner("claude", { accessMode: "api", apiKey: "settings-key" })` → `AgentApiRunner`
  - Test: cli→api sequence — first call returns `AgentRunner`, second call (same agentId, `accessMode: "api"`) returns `AgentApiRunner`
  - Test: api→cli sequence — first call returns `AgentApiRunner`, second call (same agentId, `accessMode: "cli"`, installed binary) returns `AgentRunner`
  - Note: these verify the factory is stateless — each call with valid credentials independently produces the correct type

### P1: Ship If Capacity Allows

- [ ] **clearHistory + re-render**: `tab.clearHistory()` → DOM re-rendered with empty state, `getHistory()` returns `[]`
- [ ] **Context payload tests**: vaultPath appears in `runner.runCalls[0].context`; `getActiveFile()` returns a mock file → `vault.read()` content included in context; content truncated at `MAX_CONTEXT_BYTES`; vault read failure → `activeFileContent: null`
- [ ] **Input keydown send test**: simulate `Enter` keypress on textarea → `runner.run()` called

### Deferred

- `AgentSidebarView` tab lifecycle DOM tests — requires WorkspaceLeaf/ItemView stubs; better covered by E2E
- Retry button behavior — interaction requires complex DOM state; low priority
- Debug panel output (debugMode: true path) — conditional rendering, low risk

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `vitest.unit.config.ts` | Create | Vitest config: jsdom env, unit test pattern, obsidian alias |
| `package.json` | Modify | Add `"test-unit"` script |
| `Makefile` | Modify | Add `test-unit` target; add to `test-all` |
| `tests/unit/helpers/obsidianDomPolyfill.ts` | Create | HTMLElement polyfill: createEl, createDiv, createSpan, addClass, removeClass, empty |
| `tests/unit/agent-chat-tab.unit.test.ts` | Create | AgentChatTab: render, send flow, token, stderr, complete, error, fileOp, equivalence, lifecycle |
| `tests/integration/runner-factory.integration.test.ts` | Modify | Add mode-switching describe block (4 sequences) |

## Definition of Done

- [ ] `npm run test-unit` runs and all unit tests pass
- [ ] `make test-integration` continues to pass (mode-switching tests added, existing tests unaffected)
- [ ] `npm test` (existing unit tests) passes
- [ ] `npm run build` passes — no TypeScript errors
- [ ] All event-flow tests (`token`, `complete`, `error`, `fileOpStart`, `fileOpResult`, `stderr`) use `triggerSend()` before emitting events — no false-positive no-op tests
- [ ] Duplicate send suppression verified: two rapid clicks → `runner.runCalls.length === 1`
- [ ] At least 2 tests explicitly document CLI/API runner equivalence (one each)
- [ ] Mode-switching tests cover all 4 sequences: cli-only, api-only, cli→api, api→cli
- [ ] Mode-switching tests verify runner actually executes (call `runner.run()` and collect first event) — not just instance type
- [ ] Destroy/recreate lifecycle test passes (CLI runner → destroy → API runner)
- [ ] Destroy test verifies old runner has no listeners after `tab.destroy()` (`runner.listenerCount("token") === 0`)
- [ ] Mode-switching tests use settings-level `apiKey` (not shell env vars) to avoid cache dependency
- [ ] No production source files modified
- [ ] No new npm packages added
- [ ] Polyfill applied globally via `setupFiles` (not inline in test files)
- [ ] Polyfill uses `configurable: true, writable: true` on all defined properties
- [ ] Polyfill file has a comment documenting known differences from real Obsidian
- [ ] `crypto.randomUUID()` availability verified (polyfilled if needed in JSDOM)
- [ ] `make test-all` includes `test-unit`
- [ ] `CLAUDE.md` updated with `npm run test-unit` command

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Polyfill conflicts with JSDOM existing `HTMLElement` prototype | Low | Medium | `configurable: true, writable: true`; test polyfill in isolation first |
| `AgentChatTab` import of `obsidian` fails at module load | High | High | Alias `obsidian` → `obsidianStub.ts` in vitest config (same pattern as integration tests) |
| `crypto.randomUUID()` unavailable in JSDOM | Medium | Medium | Conditional polyfill in setup file |
| `scrollTop`/`scrollHeight` no-op in JSDOM | Low | Low | Tests don't assert scroll position |
| Event-flow tests pass without streaming state (false positives) | Medium | High | **Must** use `triggerSend()` before all event tests — DoD enforces this |
| `triggerSend()` `setTimeout(0)` flush insufficient | Low | Medium | Use `vi.waitFor()` if `setTimeout(0)` proves unreliable; vitest's JSDOM uses a single-threaded event loop so this is generally stable |
| JSDOM `HTMLElement.prototype` polyfill leaks across test files | Low | Medium | vitest creates a fresh JSDOM context per test file; prototype mutations in setup file apply once per context — no cross-file leak |
| Mode-switching tests affected by `resolveShellEnv` cache | Low | Medium | Settings-level `apiKey` bypasses env resolution in factory |

## Security Considerations

- No new attack surface: tests are Node-only, JSDOM environment, no network, no real filesystem
- Polyfill modifies `HTMLElement.prototype` globally within the test process — contained to JSDOM test runs
- No real API keys in tests; mock stubs emit synthetic events

## Observability & Rollback

- Post-ship verification: `npm run test-unit` passes → `AgentChatTab` event handling verified; `make test-integration` passes → mode-switching verified
- Rollback: all changes are test files + config; zero risk to production behavior; delete new files to revert

## Documentation

- [ ] Update `CLAUDE.md` build section to include `npm run test-unit`

## Dependencies

- Sprint 003–005 complete: `fakeAgent.ts`, `obsidianStub.ts`, `vitest.integration.config.ts` pattern all available
- No new npm packages: vitest supports JSDOM natively; `jsdom` is already a transitive dependency

## Devil's Advocate Critiques Addressed

*From Codex's devil's advocate review:*

- **Listener disposal verification**: Added DoD item and test step — verify `cliRunner.listenerCount("token") === 0` after `tab.destroy()` ✓
- **Duplicate send suppression gap**: Added two tests for rapid double-click/Enter → single `runner.run()` call ✓
- **Mode-switch DoD too narrow (type-only)**: Added DoD item requiring runner actually executes (not just instance type check) ✓
- **`setTimeout(0)` timing**: Documented `vi.waitFor()` fallback in risks; JSDOM single-threaded event loop makes `setTimeout(0)` stable ✓
- **JSDOM prototype leak across files**: Clarified that vitest creates fresh JSDOM context per test file ✓

*Critiques rejected (with reasoning):*

- **"No production changes = low risk"**: Risk-free test sprint is a feature. Incorrect tests are addressed by DoD + send-first requirement.
- **"EventEmitter stubs hide race conditions"**: Integration tests with `fakeAgent.ts` cover real async. Chat tab tests are correctly unit-scoped; mocking runners is the right boundary.
- **"triggerSend institutionalizes one path"**: By design. Out-of-order event behavior is the runner's responsibility, not the chat tab's. We test the contract, not edge cases the runner is supposed to prevent.
- **"Polyfill has no fidelity checks"**: Known differences are documented in a comment per DoD. Accepted tradeoff for Node-based testing.
- **"CLI/API labels don't prove distinct contracts"**: Correct — that's the point. The equivalence test documents that `AgentChatTab` is runner-agnostic, which is the design goal.
- **"Context payload tests P1"**: Context building is three lines of `JSON.stringify`; keeping P1 is correct.

## Open Questions

None.
