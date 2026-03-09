# Sprint 006: AgentChatTab Unit Tests + CLI/API Mode-Switching Coverage

## Overview

Sprint 005 completed the mock infrastructure for API agents. CLI agents have been mockable since Sprint 003 via `writeFakeScript`. What's missing is any test of the *glue layer*: `AgentChatTab`, which binds runner events (token, complete, error, fileOpStart, fileOpResult) to Obsidian's DOM and manages conversation state.

The answer to "is this possible to mock?" is **yes**. The strategy is:

1. **AgentChatTab unit tests**: Run under vitest's JSDOM environment. A small setup file polyfills Obsidian's `HTMLElement` extensions (`createEl`, `createDiv`, `createSpan`, `addClass`, `removeClass`, `empty`) on `HTMLElement.prototype`. A minimal `App` stub provides `workspace.getActiveFile() → null` and `vault.read() → ""`. The runner under test is a plain `EventEmitter` — no CLI process, no HTTP call needed. Both CLI and API runners share the `AgentExecutionRunner` interface, so the same test doubles exercise both paths.

2. **Mode-switching tests**: Add to `runner-factory.integration.test.ts`. Same agentId (`claude`), different `accessMode` in settings → different runner type. Verify `createRunner` returns `AgentRunner` in CLI mode and `AgentApiRunner` in API mode, called in sequence. This directly tests the switching scenario.

The scope is deliberately narrow: `AgentChatTab` event-handling correctness and `createRunner` mode-switching. `AgentSidebarView`'s tab lifecycle (DOM build/destroy) is Obsidian-specific and better covered by E2E.

## Use Cases

1. **CLI runner stub sends tokens → appears in DOM**: `AgentChatTab` receives `token` events from an EventEmitter and updates the streaming message element.
2. **API runner stub completes → message finalized**: `complete` event transitions streaming message to permanent history entry.
3. **Error from either runner type → error card rendered**: `error` event shows error element with retry button.
4. **fileOpStart + fileOpResult → file operation cards**: Pending card appears on `fileOpStart`, replaced by result card on `fileOpResult`.
5. **Mode-switching via factory**: `createRunner("claude", { accessMode: "cli" }, ...)` → `AgentRunner`; `createRunner("claude", { accessMode: "api" }, ...)` → `AgentApiRunner`. Both runner types are created from the same agentId.

## Architecture

```
tests/unit/
├── helpers/
│   └── obsidianDomPolyfill.ts      Polyfill HTMLElement with Obsidian extensions
└── agent-chat-tab.unit.test.ts     AgentChatTab event handling tests

vitest.unit.config.ts               New config: jsdom env, unit test pattern
```

The existing `runner-factory.integration.test.ts` gains a new `describe("mode switching")` block.

### Obsidian DOM Polyfill

`AgentChatTab` uses these Obsidian-specific `HTMLElement` methods:

| Method | Implementation |
|--------|---------------|
| `empty()` | `this.innerHTML = ""` |
| `addClass(cls)` | `this.classList.add(cls)` |
| `removeClass(cls)` | `this.classList.remove(cls)` |
| `createEl(tag, opts?)` | `document.createElement(tag)` + apply `cls`, `text`, `attr` |
| `createDiv(opts?)` | `this.createEl("div", opts)` |
| `createSpan(opts?)` | `this.createEl("span", opts)` |

These are applied to `HTMLElement.prototype` in the setup file. All other APIs used by `AgentChatTab` (`textContent`, `querySelector`, `scrollTop`, `scrollHeight`, `addEventListener`, `disabled`, `value`) are standard DOM present in JSDOM.

### Runner Stub

```typescript
class MockRunner extends EventEmitter implements AgentExecutionRunner {
  async run(_messages: ChatMessage[], _context: string): Promise<void> {
    // Test controls events manually — emit on the runner instance
  }
  dispose(): void {}
}
```

Tests emit events directly: `runner.emit("token", "Hello")`, `runner.emit("complete")`.

### App Stub

```typescript
const mockApp = {
  workspace: { getActiveFile: () => null },
  vault: { read: async () => "", adapter: { basePath: "/test-vault" } },
} as unknown as App;
```

### Plugin Stub

```typescript
const mockPlugin = {
  settings: { debugMode: false },
} as unknown as AgentSidebarPlugin;
```

## Implementation Plan

### P0: Must Ship

#### Phase 1: vitest unit config (~10%)

**Files:**
- `vitest.unit.config.ts` — new

**Tasks:**
- [ ] Create `vitest.unit.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";
  export default defineConfig({
    test: {
      environment: "jsdom",
      include: ["tests/unit/**/*.unit.test.ts"],
      setupFiles: ["tests/unit/helpers/obsidianDomPolyfill.ts"],
    },
  });
  ```
- [ ] Add `"test-unit": "vitest run --config vitest.unit.config.ts"` to `package.json` scripts
- [ ] Add `test-unit` target to `Makefile` and `.PHONY`

#### Phase 2: Obsidian DOM polyfill (~15%)

**Files:**
- `tests/unit/helpers/obsidianDomPolyfill.ts` — new

**Tasks:**
- [ ] Implement `obsidianDomPolyfill.ts`:
  ```ts
  // Polyfill Obsidian's HTMLElement extensions for JSDOM unit tests.
  // These methods mirror the Obsidian API surface used by AgentChatTab.

  interface DomElementInfo {
    cls?: string;
    text?: string;
    attr?: Record<string, string | number>;
    type?: string;
  }

  Object.defineProperties(HTMLElement.prototype, {
    empty: {
      value(this: HTMLElement) { this.innerHTML = ""; },
      configurable: true,
    },
    addClass: {
      value(this: HTMLElement, cls: string) { this.classList.add(cls); },
      configurable: true,
    },
    removeClass: {
      value(this: HTMLElement, cls: string) { this.classList.remove(cls); },
      configurable: true,
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
      configurable: true,
    },
    createDiv: {
      value(this: HTMLElement, opts?: DomElementInfo) {
        return (this as any).createEl("div", opts);
      },
      configurable: true,
    },
    createSpan: {
      value(this: HTMLElement, opts?: DomElementInfo) {
        return (this as any).createEl("span", opts);
      },
      configurable: true,
    },
  });
  ```
- [ ] Verify polyfill compiles under the unit test tsconfig (may need `tsconfig.unit.json` with `"lib": ["DOM", "ES2020"]`)

#### Phase 3: mockObsidian module stub for unit tests (~5%)

**Files:**
- `tests/unit/helpers/mockObsidianModule.ts` — new (or reuse `tests/integration/helpers/mockObsidian.ts` if compatible)

**Tasks:**
- [ ] Create a `vi.mock("obsidian")` stub for the unit test environment. `AgentChatTab` imports `App` from `obsidian` — but only as a type. The module stub only needs to satisfy import-time resolution; actual `App` usage is covered by the `mockApp` stub passed to the constructor.
- [ ] Verify that `vitest.unit.config.ts` has `resolve.alias` mapping `"obsidian"` to the stub, matching the pattern in `vitest.integration.config.ts`

#### Phase 4: AgentChatTab unit tests (~55%)

**Files:**
- `tests/unit/agent-chat-tab.unit.test.ts` — new

**Tasks:**

```ts
// Setup per test:
let container: HTMLDivElement;
let runner: MockRunner;
let tab: AgentChatTab;

beforeEach(() => {
  container = document.createElement("div");
  runner = new MockRunner();
  tab = new AgentChatTab(container, runner, mockDetection, mockApp, mockPlugin);
});

afterEach(() => {
  tab.destroy();
});
```

- [ ] **Render tests**:
  - Test: `AgentChatTab` constructor renders without throwing
  - Test: container has `.ai-sidebar-chat` class
  - Test: input element present with `data-testid="ai-agent-chat-input"`
  - Test: send button present with `data-testid="ai-agent-chat-submit"`
  - Test: empty state message shown when history is empty

- [ ] **Token streaming tests**:
  - Test: `runner.emit("token", "Hello")` → streaming message element appears in DOM
  - Test: multiple `token` events accumulate in the streaming message content element
  - Test: `status` element ("Thinking…") disappears after first token

- [ ] **Completion tests**:
  - Test: `runner.emit("complete")` after tokens → streaming class removed from message
  - Test: `complete` event → send button re-enabled, input re-enabled
  - Test: content persists in message element after `complete`

- [ ] **Error tests**:
  - Test: `runner.emit("error", new Error("connection refused"))` → `[data-testid="ai-agent-chat-error"]` element appears
  - Test: error element contains the error message text
  - Test: send button re-enabled after error

- [ ] **fileOp tests**:
  - Test: `runner.emit("fileOpStart", { op: "read", path: "test.md" })` → pending card appears in streaming message
  - Test: `runner.emit("fileOpResult", op, { ok: true, result: {} })` → pending card replaced by result card
  - Test: `runner.emit("fileOpResult", op, { ok: false, error: "Access denied" })` → error class on op label

- [ ] **CLI runner vs API runner equivalence**:
  - Test: create tab with `AgentRunnerStub` (EventEmitter stub simulating CLI runner) → token events handled correctly
  - Test: create tab with `ApiRunnerStub` (EventEmitter stub simulating API runner) → identical event handling
  - The two stubs are identical in implementation (both just EventEmitters) — this test documents that `AgentChatTab` is agnostic to runner type

- [ ] **History management**:
  - Test: `getHistory()` returns empty array before any send
  - Test: after tokens + complete, `getHistory()` includes assistant message with content

#### Phase 5: Mode-switching tests in runner-factory (~15%)

**Files:**
- `tests/integration/runner-factory.integration.test.ts` — modify (add describe block)

**Tasks:**
- [ ] Add `describe("mode switching")` block:
  - Test: same agentId (`claude`), `accessMode: "cli"` → `createRunner` returns `AgentRunner`
  - Test: same agentId (`claude`), `accessMode: "api"` → `createRunner` returns `AgentApiRunner`
  - Test: call `createRunner` with `cli` then `api` in sequence (simulating a settings change) → second call returns `AgentApiRunner` (no state pollution from first call)
  - Test: call `createRunner` with `api` then `cli` in sequence → second call returns `AgentRunner`
  - Note: these tests verify the factory is stateless; each call with valid credentials produces the expected runner type

### P1: Ship If Capacity Allows

- [ ] **clearHistory + re-render test**: `tab.clearHistory()` → DOM re-rendered with empty state, `getHistory()` returns `[]`
- [ ] **dispose mid-stream test**: `runner.emit("token", "...")` then `tab.destroy()` → no crash; runner dispose called
- [ ] **Input keydown send test**: simulate `Enter` keypress on textarea → `runner.run()` called (requires spy)

### Deferred

- `AgentSidebarView` tab lifecycle tests — requires more extensive Obsidian API stubs (WorkspaceLeaf, ItemView); better covered by E2E
- `AgentChatTab` vault/file context injection tests — requires `app.vault.read()` mock returning actual content; low risk, low value
- YOLO mode flag verification — CLI adapter tests already cover this

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `vitest.unit.config.ts` | Create | Vitest config: jsdom env, unit test pattern, polyfill setup |
| `package.json` | Modify | Add `"test-unit"` script |
| `Makefile` | Modify | Add `test-unit` target |
| `tests/unit/helpers/obsidianDomPolyfill.ts` | Create | HTMLElement polyfill: createEl, createDiv, createSpan, addClass, removeClass, empty |
| `tests/unit/helpers/mockObsidianModule.ts` | Create | vi.mock("obsidian") stub for unit test environment |
| `tests/unit/agent-chat-tab.unit.test.ts` | Create | AgentChatTab: render, token streaming, complete, error, fileOp, mode equivalence |
| `tests/integration/runner-factory.integration.test.ts` | Modify | Add mode-switching describe block (CLI→API, API→CLI, sequence) |

## Definition of Done

- [ ] `npm run test-unit` runs and all unit tests pass
- [ ] `make test-integration` continues to pass (runner-factory mode-switching tests added, existing tests unaffected)
- [ ] `npm test` (existing unit tests) passes
- [ ] `npm run build` passes — no TypeScript errors
- [ ] `AgentChatTab` unit tests cover: render, token accumulation, complete, error, fileOpStart, fileOpResult
- [ ] At least 2 tests explicitly document CLI/API runner equivalence (one each for a CLI stub and an API stub)
- [ ] Mode-switching tests cover all 4 sequences: cli-only, api-only, cli→api, api→cli
- [ ] No new production source files modified
- [ ] No new npm packages added
- [ ] Polyfill is applied globally via `setupFiles` (not inline in test files)
- [ ] `mockApp.workspace.getActiveFile()` returns `null` — no real file system needed
- [ ] JSDOM environment does not bleed into integration or E2E test suites (separate config)
- [ ] All tests are deterministic (no timing dependencies — runner stubs emit synchronously or in controlled `await` sequences)

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Obsidian `HTMLElement` extensions conflict with JSDOM's existing prototype | Low | Medium | Use `Object.defineProperties` with `configurable: true`; test early |
| `AgentChatTab` imports `obsidian` at module level causing import failure | High | High | Module alias in vitest config (same pattern as integration config) |
| `crypto.randomUUID()` not available in JSDOM environment | Medium | Medium | Add `vi.stubGlobal("crypto", { randomUUID: () => "test-id" })` in setup if needed |
| `scrollTop`/`scrollHeight` assignment in JSDOM is a no-op | Low | Low | Tests don't assert scroll position — only DOM content |
| Runner-factory mode-switching test state pollution from `resolveShellEnv` cache | Low | Medium | Each sequence test is independent; `beforeAll` sets env vars once; `pool: "forks"` isolates processes |

## Security Considerations

- No new attack surface: tests are Node-only, no network, no real filesystem
- Polyfill modifies `HTMLElement.prototype` globally within the test process — this is intentional and contained within the JSDOM environment
- No real API keys used in unit tests; runner stubs emit synthetic events

## Observability & Rollback

- Post-ship verification: `npm run test-unit` passes → `AgentChatTab` event handling is tested; `make test-integration` passes → mode-switching is verified
- Rollback: all changes are test-only (new files + new describe block); zero risk to production behavior; simply delete the new files if needed

## Documentation

- [ ] Add `"test-unit"` to the list of test commands in `CLAUDE.md` build section

## Dependencies

- Sprint 003–005 complete: existing test infrastructure, helpers, and runner stubs available
- No new npm packages: `vitest` supports JSDOM out of the box; `jsdom` is already a transitive dependency

## Open Questions

None — all questions from the Intent document answered during Phase 2/3 analysis:
1. Obsidian element methods used by `AgentChatTab`: `createDiv`, `createSpan`, `createEl`, `addClass`, `removeClass`, `empty` (audited from source)
2. Polyfill should be global via `setupFiles` — same pattern as `mockObsidian.ts` in integration config
3. Mode-switching tests should call `createRunner` directly (cleaner, faster, tests the factory not the view)
