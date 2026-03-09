# Sprint 007: Comprehensive Test Gap-Filling

**Status:** Planned

## Overview

Six sprints have delivered a feature-complete plugin with a strong three-layer test suite. This sprint fills the remaining meaningful coverage gaps, all of which are testable using infrastructure and patterns already established in the project.

The gaps fall into four categories:

1. **Provider pure functions** — `buildSystemPrompt` is an untested private module-level function in all four provider files. GeminiProvider's message-alternating logic and OpenAIProvider's model-ID filter are unique business logic that also need coverage. Minor named exports unlock direct unit testing without mocking the provider SDKs.

2. **AgentChatTab P1 deferred items** — `clearHistory`, context payload shape (vaultPath, active file content, truncation), and Enter-key send were explicitly deferred from Sprint 006 and now ship.

3. **Runner integration edge cases** — AgentRunner integration tests cover only the streaming parser and dispose; `stderr` events, non-zero exit codes, and extraArgs/yoloArgs passthrough are untested. AgentApiRunner integration tests only cover `read` file-ops; `write`, `delete`, `rename`, and `list` variants have no coverage.

4. **Gemini E2E chat** — The Gemini chat interaction test was P1 in Sprint 005. This sprint adds `baseURL` support to `GeminiProvider` (same pattern as Anthropic and OpenAI, already implemented) and extends the E2E suite with a Gemini mock-server describe block.

No new npm packages. All test additions follow established patterns.

## Use Cases

1. **Provider buildSystemPrompt correctness**: All four providers produce correct system prompts independently tested.
2. **Gemini message alternating**: Consecutive same-role messages are merged; export enables pure-function testing without the Google AI SDK.
3. **OpenAI model filter**: Only `gpt-` and `o\d` model IDs pass the listModels filter.
4. **OpenAI-compat empty API key**: When no API key is provided, the constructor substitutes `"ollama"` as the placeholder.
5. **AgentChatTab clearHistory**: Chat resets to empty state; `getHistory()` returns `[]`.
6. **AgentChatTab context payload**: Runner receives vaultPath, active file content (read + truncated at 8192 bytes), null when no active file, and null on vault read failure.
7. **AgentChatTab Enter-key send**: Enter in the textarea triggers send; Shift+Enter does not.
8. **AgentRunner stderr**: stderr text emitted by the subprocess is forwarded as a `stderr` event (tested at integration layer); AgentChatTab renders it as status text (already covered by existing unit test).
9. **AgentRunner non-zero exit**: A subprocess that exits non-zero causes an `error` event.
10. **AgentRunner extraArgs and yoloArgs**: Both extra args and YOLO args are forwarded to the spawned process.
11. **AgentApiRunner write/delete/rename/list**: All file-op block types are parsed and executed correctly via the streaming parser.
12. **runnerFactory settings-level apiBaseUrl**: Settings-level `apiBaseUrl` takes precedence over env var; invalid settings URL suppresses a valid env URL (debug log fired).
13. **E2E Gemini chat**: Sending a message in Gemini API mode returns the mock response in the chat UI.

## Architecture

```
Source changes (minimal):
  src/providers/AnthropicProvider.ts    export buildSystemPrompt
  src/providers/OpenAIProvider.ts       export buildSystemPrompt; extract+export filterOpenAIModelId
  src/providers/GeminiProvider.ts       add baseURL param; export buildSystemPrompt; extract+export mergeGeminiMessages
  src/providers/OpenAICompatProvider.ts export buildSystemPrompt
  src/AgentApiRunner.ts                 pass baseURL to GeminiProvider in createProvider()

Unit tests (npm test):
  src/__tests__/AnthropicProvider.test.ts      NEW — 6 buildSystemPrompt tests
  src/__tests__/OpenAIProvider.test.ts         NEW — 6 buildSystemPrompt + 6 filterOpenAIModelId tests
  src/__tests__/GeminiProvider.test.ts         NEW — 6 buildSystemPrompt + 6 mergeGeminiMessages tests
  src/__tests__/OpenAICompatProvider.test.ts   NEW — 6 buildSystemPrompt + 1 empty-key constructor test

Unit tests (npm run test-unit):
  tests/unit/agent-chat-tab.unit.test.ts  MODIFY — add clearHistory (3), context payload (4), Enter-key (2) tests

Integration tests (make test-integration):
  tests/integration/helpers/fakeAgent.ts                  MODIFY — add writeStderrScript, writeExitCodeScript, writeArgCaptureScript
  tests/integration/agent-runner.integration.test.ts      MODIFY — add stderr, exit-code, extraArgs, yoloArgs describe blocks
  tests/integration/agent-api-runner.integration.test.ts  MODIFY — add write/delete/rename/list file-op + failure result tests
  tests/integration/runner-factory.integration.test.ts    MODIFY — add settings-level apiBaseUrl precedence tests

E2E tests (make test-e2e):
  tests/e2e/helpers/mockApiServer.ts        MODIFY — add Gemini JSON format route
  tests/e2e/chat-interaction.e2e.test.ts    MODIFY — add Gemini describe block
```

## Implementation Plan

### P0: Must Ship

#### Phase 1: Export provider pure functions (~5%)

**Files:** `src/providers/AnthropicProvider.ts`, `src/providers/OpenAIProvider.ts`, `src/providers/GeminiProvider.ts`, `src/providers/OpenAICompatProvider.ts`, `src/AgentApiRunner.ts`

**Tasks:**
- [ ] `AnthropicProvider.ts`: Add `export` keyword to `buildSystemPrompt` (no behavior change)
- [ ] `OpenAIProvider.ts`: Add `export` to `buildSystemPrompt`; extract the model-filter predicate as `export function filterOpenAIModelId(id: string): boolean` (`.startsWith("gpt-") || /^o\d/.test(id)`); update `listModels()` to use `filterOpenAIModelId` internally
- [ ] `GeminiProvider.ts`: Add `constructor(apiKey: string, baseURL?: string)` — store `baseURL`; pass as `requestOptions: { baseUrl: baseURL }` to `getGenerativeModel()` when present; extract the message-merging loop as `export function mergeGeminiMessages(messages: ChatMessage[]): Content[]`; update `stream()` to call `mergeGeminiMessages`; add `export` to `buildSystemPrompt`
- [ ] `OpenAICompatProvider.ts`: Add `export` to `buildSystemPrompt`
- [ ] `AgentApiRunner.ts`: In `createProvider()`, change `new GeminiProvider(apiKey)` to `new GeminiProvider(apiKey, baseURL)` — same pattern as Anthropic and OpenAI
- [ ] Run `npm run build` — no TypeScript errors

**Note on Gemini SDK URL path**: Before Phase 7, verify the actual URL path the Google AI SDK uses when `requestOptions.baseUrl` is set. The Sprint 005 plan identifies `POST /v1beta/models/{model}:streamGenerateContent` — confirm this is the path used by `chat.sendMessageStream()`. Document the verified path in a comment in `mockApiServer.ts`.

#### Phase 2: Provider unit tests (~20%)

**Files:** `src/__tests__/AnthropicProvider.test.ts`, `src/__tests__/OpenAIProvider.test.ts`, `src/__tests__/GeminiProvider.test.ts`, `src/__tests__/OpenAICompatProvider.test.ts`

Each `buildSystemPrompt` suite (6 tests, same structure for all four providers):
- [ ] Contains the vault path in the output
- [ ] Contains `:::file-op` file-op protocol marker
- [ ] Omits context section when `activeFileContent` is null
- [ ] Includes context section with `BEGIN VAULT CONTEXT` / `END VAULT CONTEXT` markers when content is provided
- [ ] Truncates content at 8192 bytes
- [ ] Does not truncate content shorter than 8192 bytes

Additional `OpenAIProvider` tests — `describe("filterOpenAIModelId")`:
- [ ] `"gpt-4o"` → true
- [ ] `"gpt-3.5-turbo"` → true
- [ ] `"o1"` → true; `"o3-mini"` → true
- [ ] `"claude-3"` → false
- [ ] `"gemini-1.5-pro"` → false
- [ ] `"text-davinci-003"` → false (not a gpt- prefix)

Additional `GeminiProvider` tests — `describe("mergeGeminiMessages")`:
- [ ] Single user message → `[{ role: "user", parts: [{ text: "..." }] }]`
- [ ] Alternating user/assistant/user → 3 entries with correct roles (`user`, `model`, `user`)
- [ ] Two consecutive user messages → merged into one entry (content joined with `\n`)
- [ ] Two consecutive assistant messages → merged into one `model` entry
- [ ] Empty messages array → `[]`
- [ ] All-assistant messages → `[{ role: "model", ... }]` (guard for last-not-user is in `stream()`, not in `mergeGeminiMessages`)

Additional `OpenAICompatProvider` test — `describe("constructor")`:
- [ ] Empty string apiKey → client created with apiKey `"ollama"` (verify by constructing `new OpenAICompatProvider("", "http://localhost:11434/v1")` without throwing)

#### Phase 3: AgentChatTab P1 unit tests (~10%)

**Files:** `tests/unit/agent-chat-tab.unit.test.ts`

- [ ] **`describe("clearHistory")`**:
  - After send + complete, `tab.clearHistory()` → `tab.getHistory()` returns `[]`
  - After `clearHistory()`, DOM shows empty state element (`.ai-sidebar-empty` present)
  - After `clearHistory()`, no `[data-testid="ai-agent-chat-message-user"]` or `[data-testid="ai-agent-chat-message-assistant"]` in DOM

- [ ] **`describe("context payload")`**:
  Create `mockAppWithFile` for these tests:
  ```typescript
  const mockAppWithFile = {
    workspace: { getActiveFile: () => ({ path: "notes/active.md" }) },
    vault: {
      read: async () => "# Active Note\nSome content here",
      adapter: { basePath: "/test-vault" },
    },
  } as unknown as App;
  ```
  - After send with `mockAppWithFile`, `JSON.parse(runner.runCalls[0].context).vaultPath === "/test-vault"`
  - After send with `mockAppWithFile`, `JSON.parse(runner.runCalls[0].context).activeFileContent === "# Active Note\nSome content here"`
  - After send with default `mockApp` (no active file), `JSON.parse(runner.runCalls[0].context).activeFileContent === null`
  - After send with `mockApp` that has `vault.read` return `"x".repeat(20_000)`, `JSON.parse(runner.runCalls[0].context).activeFileContent.length === 8192`
  - After send with `mockApp` where `vault.read` throws (use `{ vault: { read: async () => { throw new Error("read error") }, ... } }`), `JSON.parse(runner.runCalls[0].context).activeFileContent === null`

- [ ] **`describe("Enter-key send")`**:
  - Dispatch `new KeyboardEvent("keydown", { key: "Enter", bubbles: true })` on the textarea → `runner.runCalls.length === 1` after `setTimeout(0)` flush
  - Dispatch `new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true })` → `runner.runCalls.length === 0`

#### Phase 4: AgentRunner integration edge cases (~15%)

**Files:** `tests/integration/helpers/fakeAgent.ts`, `tests/integration/agent-runner.integration.test.ts`

**Tasks — `fakeAgent.ts`:**
- [ ] Export `writeStderrScript(stderrMessages: string[], stdoutChunks: string[]): string` — writes stderr lines then exits 0
- [ ] Export `writeExitCodeScript(exitCode: number, stdoutChunks?: string[]): string` — writes chunks then `process.exit(code)`
- [ ] Export `writeArgCaptureScript(): string` — writes `JSON.stringify(process.argv.slice(2))` to stdout, then exits 0

**Tasks — `agent-runner.integration.test.ts`:**
- [ ] `describe("stderr events")`:
  - Test: `writeStderrScript(["from-stderr"])` → runner emits `stderr` event with text `"from-stderr"`
  - Test: stderr text does NOT appear in `tokens` array
- [ ] `describe("non-zero exit")`:
  - Test: `writeExitCodeScript(1)` → runner emits `error` event
  - Test: error message contains `"1"` or `"exit"` (references the non-zero code)
- [ ] `describe("extraArgs passthrough")`:
  - Test: runner created with `extraArgs: ["--flag", "value"]` via adapter that uses positional args → `writeArgCaptureScript()` receives those args in stdout
- [ ] `describe("yoloArgs passthrough")`:
  - Test: runner created with `yoloMode: true` (using an adapter with `yoloArgs: ["--yes"]`) → arg capture script receives `--yes` before other args

#### Phase 5: AgentApiRunner file-op variant integration tests (~15%)

**Files:** `tests/integration/agent-api-runner.integration.test.ts`

Add to or extend the `describe(":::file-op protocol parsing")` block:

**Tasks:**
- [ ] **write op**: provider yields `:::file-op\n{"op":"write","path":"api-write.md","content":"hello"}\n:::\n` → `fileOpStarts[0].op === "write"` and `fileOpResults[0].result.ok === true`
- [ ] **delete op**: yields `{"op":"delete","path":"api-del.md"}` → `fileOpStarts[0].op === "delete"`
- [ ] **rename op**: yields `{"op":"rename","oldPath":"old.md","newPath":"new.md"}` → `fileOpStarts[0].op === "rename"` and `fileOpStarts[0].oldPath === "old.md"`
- [ ] **list op**: yields `{"op":"list","path":"/"}` → `fileOpStarts[0].op === "list"`
- [ ] **file-op failure**: `mockHandler.execute` returns `{ ok: false, error: "not found" }` → `fileOpResults[0].result.ok === false` and `fileOpResults[0].result.error === "not found"`

Update `mockHandler` for these tests: the default stub returns a read-specific result — for write/delete/rename/list, returning `{ ok: true, result: {} }` is sufficient. Use a flexible stub that accepts any op.

#### Phase 6: runnerFactory settings-level apiBaseUrl precedence test (~5%)

**Files:** `tests/integration/runner-factory.integration.test.ts`

Add to the existing `describe("base URL env var override")` block:

**Tasks:**
- [ ] Test: settings `apiBaseUrl` set to valid URL → runner is `AgentApiRunner` (no error; settings URL accepted)
  ```typescript
  // Settings has apiBaseUrl; detection has apiKey
  const settings = { ...makeSettings("claude", "api"), agents: {
    ...makeSettings("claude", "api").agents,
    claude: { ...makeSettings("claude", "api").agents.claude, apiKey: "key", apiBaseUrl: "http://127.0.0.1:9999" }
  }};
  const runner = await createRunner("claude", settings, [detection], mockHandler);
  expect(runner).toBeInstanceOf(AgentApiRunner);
  ```
- [ ] Test: settings `apiBaseUrl` set to **invalid** URL + env var set to valid URL → runner is still `AgentApiRunner` (API key works), and `console.debug` is called with a message about the invalid URL (use `vi.spyOn(console, "debug")` with `debugMode: true` in settings)
  - This verifies that an invalid settings URL suppresses the valid env URL (settingsBaseUrl wins the `||` precedence even though it's invalid)
- [ ] Test: settings `apiBaseUrl` is empty string or undefined → env var URL is used (runner is `AgentApiRunner`, no debug log about invalid URL)

#### Phase 7: Gemini mock server routes and E2E chat test (~15%)

**Files:** `tests/e2e/helpers/mockApiServer.ts`, `tests/e2e/chat-interaction.e2e.test.ts`

**Spike first**: Before implementing, confirm the Google AI SDK's actual request path when `requestOptions.baseUrl` is set. Expected: `POST /v1beta/models/{model}:streamGenerateContent`. Document the confirmed path as a comment in `mockApiServer.ts`.

**`mockApiServer.ts` tasks:**
- [ ] Add `buildGeminiJsonResponse(responseText: string): string` — returns a JSON array matching Gemini's response format:
  ```json
  [{"candidates":[{"content":{"parts":[{"text":"<RESPONSE>"}],"role":"model"},"finishReason":"STOP"}]}]
  ```
- [ ] Add route: `POST` to paths matching `/v1beta/models/` → respond with `application/json` (not SSE) body using `buildGeminiJsonResponse`
- [ ] Add route: `GET /v1beta/models` → respond with `{"models":[{"name":"models/gemini-test","supportedGenerationMethods":["generateContent"]}]}`
- [ ] Verify Gemini JSON format parses correctly against the SDK before the full E2E implementation (document in a comment)

**`chat-interaction.e2e.test.ts` tasks:**
- [ ] Add `describe("chat-interaction: gemini")` block following the same structure as Anthropic and OpenAI blocks:
  - `beforeAll`: start mock server, create vault with gemini enabled in API mode + `selectedModel: "gemini-test"` + `apiKey: "fake-gemini-key"` + `apiBaseUrl: http://127.0.0.1:${server.port}`, launch Obsidian, open sidebar, click Gemini tab
  - `afterAll`: quit Obsidian, cleanup vault, close mock server
  - Guard: `if (!binary) ctx.skip()`
  - Test: send message → mock returns canned response → `waitForAssistantMessage(page, MOCK_RESPONSE)` passes
  - Test: `server.requestCount` on the Gemini path `=== 1` (exact path from spike result)

### P1: Ship If Capacity Allows

- [ ] **AgentChatTab debugMode path**: Verify debug panel (`.ai-sidebar-debug-panel`) renders when `plugin.settings.debugMode = true` in a unit test
- [ ] **FileOperationsHandler list with nonexistent folder**: `{ op: "list", path: "nonexistent-folder" }` → `ok: false`, error mentions "not found"
- [ ] **FileOperationsHandler write creates nested directories**: `{ op: "write", path: "deep/nested/file.md", content: "..." }` → file exists at nested path after operation

### Deferred

- YOLO mode E2E — separate concern; coverage via integration tests is sufficient
- File-op protocol E2E via mock server — integration tests cover this thoroughly
- Cross-platform E2E (Windows, Linux) — macOS-only scope per Sprint 004
- Provider `listModels()` integration testing — requires live network/keys; outside scope
- GeminiProvider last-message-not-user guard in `stream()` — tested implicitly; `mergeGeminiMessages` is tested directly, and the guard is a single conditional that reads clearly

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/providers/AnthropicProvider.ts` | Modify | Export `buildSystemPrompt` |
| `src/providers/OpenAIProvider.ts` | Modify | Export `buildSystemPrompt`; extract + export `filterOpenAIModelId` |
| `src/providers/GeminiProvider.ts` | Modify | Add `baseURL` param; export `buildSystemPrompt`; extract + export `mergeGeminiMessages` |
| `src/providers/OpenAICompatProvider.ts` | Modify | Export `buildSystemPrompt` |
| `src/AgentApiRunner.ts` | Modify | Pass `baseURL` to `GeminiProvider` in `createProvider()` |
| `src/__tests__/AnthropicProvider.test.ts` | Create | `buildSystemPrompt` unit tests (6) |
| `src/__tests__/OpenAIProvider.test.ts` | Create | `buildSystemPrompt` (6) + `filterOpenAIModelId` (6) unit tests |
| `src/__tests__/GeminiProvider.test.ts` | Create | `buildSystemPrompt` (6) + `mergeGeminiMessages` (6) unit tests |
| `src/__tests__/OpenAICompatProvider.test.ts` | Create | `buildSystemPrompt` (6) + empty-key constructor (1) unit tests |
| `tests/unit/agent-chat-tab.unit.test.ts` | Modify | Add clearHistory (3), context payload (4), Enter-key (2) tests |
| `tests/integration/helpers/fakeAgent.ts` | Modify | Add `writeStderrScript`, `writeExitCodeScript`, `writeArgCaptureScript` |
| `tests/integration/agent-runner.integration.test.ts` | Modify | Add stderr, non-zero exit, extraArgs, yoloArgs describe blocks |
| `tests/integration/agent-api-runner.integration.test.ts` | Modify | Add write/delete/rename/list file-op tests + failure result test |
| `tests/integration/runner-factory.integration.test.ts` | Modify | Add settings-level `apiBaseUrl` precedence tests (3) |
| `tests/e2e/helpers/mockApiServer.ts` | Modify | Add Gemini JSON format routes |
| `tests/e2e/chat-interaction.e2e.test.ts` | Modify | Add Gemini describe block |

## Definition of Done

- [ ] `npm run build` passes — no TypeScript errors
- [ ] `npm test` passes — all existing + 4 new provider test files passing
- [ ] `npm run test-unit` passes — all existing + 9 new AgentChatTab tests passing
- [ ] `make test-integration` passes — all existing tests + runner edge cases + file-op variants + runnerFactory precedence
- [ ] `make test-e2e` runs without error (skips gracefully when Obsidian binary absent)
- [ ] `buildSystemPrompt` exported from all 4 provider files with no behavior change
- [ ] `filterOpenAIModelId` extracted and used internally by `listModels()` in `OpenAIProvider`
- [ ] `mergeGeminiMessages` extracted and used internally by `stream()` in `GeminiProvider`
- [ ] `GeminiProvider` accepts optional `baseURL` parameter; passed to `getGenerativeModel()` as `requestOptions.baseUrl`
- [ ] `AgentApiRunner.createProvider()` passes `baseURL` to `GeminiProvider`
- [ ] All 4 `buildSystemPrompt` test suites (6 tests each) pass: vault path, file-op protocol, null context, context markers, truncation, no-truncation
- [ ] `filterOpenAIModelId` tests: gpt- (true), o\d (true), non-matching (false)
- [ ] `mergeGeminiMessages` tests: single user, alternating, consecutive-merge, empty array
- [ ] `OpenAICompatProvider` empty-key test: constructor does not throw when apiKey is `""`
- [ ] `clearHistory` tests: `getHistory()` returns `[]`, empty state re-appears, message elements removed
- [ ] Context payload tests: vaultPath present, active file content present and absent, truncation at 8192 bytes, vault read failure → null
- [ ] GeminiProvider without `baseURL`: existing `make test-integration` passes (verifies no regression in Gemini paths that don't use baseURL)
- [ ] Enter-key tests: Enter triggers send, Shift+Enter does not
- [ ] AgentRunner `stderr` event test: event emitted with subprocess stderr text; text not in tokens *(note: AgentChatTab rendering of stderr text as status is already covered by existing `tests/unit/agent-chat-tab.unit.test.ts` "stderr event" describe block)*
- [ ] AgentRunner non-zero exit test: `error` event emitted
- [ ] AgentRunner extraArgs test: args appear in subprocess output
- [ ] AgentRunner yoloArgs test: yolo flag appears before other args in subprocess output
- [ ] AgentApiRunner write/delete/rename/list tests: each produces `fileOpStart` with correct `.op` and a `fileOpResult`
- [ ] AgentApiRunner failure result test: `ok: false` from handler propagates to `fileOpResults[0].result`
- [ ] runnerFactory settings `apiBaseUrl` valid: runner is `AgentApiRunner`
- [ ] runnerFactory settings `apiBaseUrl` invalid + env valid: debug log emitted via `console.debug`; runner is still `AgentApiRunner` (API key still works)
- [ ] runnerFactory settings `apiBaseUrl` absent: env var URL is used (no debug log)
- [ ] Gemini mock server routes verified against SDK format before E2E implementation
- [ ] Gemini E2E: message sent → response appears in chat UI; request count verified
- [ ] Gemini E2E: skips gracefully when Obsidian binary absent
- [ ] No new npm packages
- [ ] `make test-all` continues to include all four test suites

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `mergeGeminiMessages` extraction breaks existing `stream()` behavior | Low | High | `npm run build` passes; `make test-integration` covers the streaming path through MockProviderAdapter |
| `filterOpenAIModelId` extraction changes `listModels()` output | Low | High | Same mitigation; unit test confirms filter logic unchanged |
| Google AI SDK ignores `requestOptions.baseUrl` for streaming path | Medium | Medium | Spike in Phase 7 before full implementation; if blocked, Gemini E2E documented as infeasible with reason |
| Gemini SDK uses different URL path than expected | Medium | Medium | Spike verifies the actual path; mock route adjusted accordingly |
| AgentRunner subprocess arg test environment-sensitive | Low | Low | Uses `process.execPath` (node) + arg-capture script; deterministic on all platforms |
| Enter-key test: `dispatchEvent` vs `fireEvent` behavior in JSDOM | Low | Low | JSDOM supports `dispatchEvent`; keydown handler uses `addEventListener("keydown", ...)` which JSDOM honors |
| runnerFactory precedence test requires `vi.spyOn(console, "debug")` | Low | Low | Vitest supports this natively; clean up spy in `afterEach` |

## Security Considerations

- All production changes are additive: optional `baseURL` parameter on `GeminiProvider` — same pattern as existing providers. No new attack surface.
- Exported functions remain pure (no side effects, no network calls). Exporting them does not change the plugin's runtime behavior.
- `writeStderrScript`, `writeExitCodeScript`, `writeArgCaptureScript` write `.mjs` files to `os.tmpdir()` — same pattern as `writeFakeScript`. Chunk content is embedded via `JSON.stringify` to prevent injection.
- Gemini mock route bound to `127.0.0.1` loopback only.
- `vi.spyOn(console, "debug")` is test-only and automatically cleaned up after each test.

## Observability & Rollback

- **Post-ship verification**: All four test commands pass → all gaps confirmed filled
- **Rollback**: Every change is either a test file addition (delete to revert) or a minor export/parameter addition. For `GeminiProvider.ts`, removing the `baseURL` parameter and reverting `AgentApiRunner.ts` restores prior behavior exactly. Zero production regression risk.

## Documentation

- No user-facing documentation changes required
- Spike result for Gemini SDK URL path documented as a comment in `mockApiServer.ts`

## Dependencies

- Sprint 004–006 complete: `fakeAgent.ts`, `obsidianStub.ts`, `vitest.unit.config.ts`, `mockApiServer.ts`, `streamFixtures.ts` all present and operational
- No new npm packages
- Obsidian binary on test machine for E2E (skips gracefully if absent)
- `main.js` must be built before E2E (enforced by `make test-e2e` depending on `build` target)

## Open Questions

None. Interview answers resolved Gemini scope and provider test approach. Gemini SDK URL path will be verified during Phase 7 spike.
