# Sprint 007: Comprehensive Test Gap-Filling

## Overview

Six sprints have built a feature-complete plugin with a strong three-layer test suite. A careful audit of the source tree against the existing tests reveals a set of concrete, well-bounded gaps that can be filled using infrastructure and patterns already established in the project. No new npm packages, no new test frameworks, no clever workarounds.

The gaps fall into four categories:
1. **Provider pure functions** — `buildSystemPrompt` is duplicated across four provider files and is untested because it was written as a private module-level function. A minor export addition makes it unit-testable. GeminiProvider's message-alternating logic and OpenAIProvider's model-ID filter are unique per-provider business logic that also need unit coverage.
2. **AgentChatTab P1 deferred** — `clearHistory`, context payload shape, and Enter-key send were explicitly deferred from Sprint 006 and now need to be shipped.
3. **Integration layer file-op variants and runner edge cases** — AgentApiRunner integration tests only cover `read` file-ops; `write`, `delete`, `rename`, and `list` variants are untested. AgentRunner integration tests have no coverage of stderr events, non-zero exit codes, or extra-args passthrough.
4. **E2E Gemini chat** — The Gemini chat interaction test was P1 in Sprint 005 and is directly implementable by extending `chat-interaction.e2e.test.ts` with the existing mock server (extended for Gemini's non-streaming JSON format).

All work follows the simplest viable path. The only source changes are minor named-export additions to provider files.

## Use Cases

1. **Provider buildSystemPrompt correctness**: All four providers produce correct system prompts (vault path, context section, file-op protocol).
2. **Gemini message alternating**: Consecutive same-role messages are merged; last-message-not-user guard returns early without crashing.
3. **OpenAI model filter**: Only `gpt-` and `o\d` model IDs are returned from `listModels()`.
4. **AgentChatTab clearHistory**: Chat resets to empty state and `getHistory()` returns `[]`.
5. **AgentChatTab context payload**: Runner receives vaultPath, active file content (truncated at 8192 bytes), and null when no active file.
6. **AgentChatTab Enter-key send**: Pressing Enter in the input textarea triggers runner.run() same as button click.
7. **AgentRunner stderr**: stderr output from the child process updates the status element.
8. **AgentRunner non-zero exit**: A script that exits non-zero causes the runner to emit an error event.
9. **AgentRunner extraArgs/yoloArgs**: Extra args and yolo args are passed through to the spawned process.
10. **AgentApiRunner write/delete/rename/list**: File-op blocks with these op types are parsed and executed correctly.
11. **runnerFactory settings apiBaseUrl**: A settings-level `apiBaseUrl` field takes precedence over the env var; an invalid value falls back gracefully.
12. **E2E Gemini chat**: Sending a message in Gemini API mode returns the mock response in the chat UI.

## Architecture

```
Unit tests (npm test / npm run test-unit):
  src/__tests__/
    AnthropicProvider.test.ts    NEW — buildSystemPrompt unit tests
    OpenAIProvider.test.ts       NEW — buildSystemPrompt + listModels filter unit tests
    GeminiProvider.test.ts       NEW — buildSystemPrompt + message merging unit tests
    OpenAICompatProvider.test.ts NEW — buildSystemPrompt + empty-apiKey unit tests
  tests/unit/
    agent-chat-tab.unit.test.ts  MODIFY — add clearHistory, context payload, Enter-key tests

Integration tests (make test-integration):
  tests/integration/
    agent-runner.integration.test.ts     MODIFY — add stderr, non-zero exit, extraArgs tests
    agent-api-runner.integration.test.ts MODIFY — add write/delete/rename/list file-op tests
    runner-factory.integration.test.ts   MODIFY — add settings-level apiBaseUrl override test

E2E tests (make test-e2e):
  tests/e2e/
    chat-interaction.e2e.test.ts  MODIFY — add Gemini describe block

Provider files (minor export additions):
  src/providers/AnthropicProvider.ts    MODIFY — export buildSystemPrompt
  src/providers/OpenAIProvider.ts       MODIFY — export buildSystemPrompt, filterOpenAIModels
  src/providers/GeminiProvider.ts       MODIFY — export buildSystemPrompt, mergeGeminiMessages
  src/providers/OpenAICompatProvider.ts MODIFY — export buildSystemPrompt

Integration helpers:
  tests/integration/helpers/fakeAgent.ts   MODIFY — add writeExitCodeScript(), writeStderrScript()
  tests/e2e/helpers/mockApiServer.ts        MODIFY — add Gemini JSON format route
```

## Implementation Plan

### P0: Must Ship

#### Phase 1: Export provider pure functions (~5%)

**Files:** `src/providers/AnthropicProvider.ts`, `src/providers/OpenAIProvider.ts`, `src/providers/GeminiProvider.ts`, `src/providers/OpenAICompatProvider.ts`

**Tasks:**
- [ ] `AnthropicProvider.ts`: Add `export` keyword to `buildSystemPrompt` function
- [ ] `OpenAIProvider.ts`: Add `export` keyword to `buildSystemPrompt`; extract model-filter predicate as `export function filterOpenAIModelId(id: string): boolean` — the single-line filter from `listModels()` (`.startsWith("gpt-") || /^o\d/.test(id)`)
- [ ] `GeminiProvider.ts`: Add `export` keyword to `buildSystemPrompt`; extract the message-merging loop as `export function mergeGeminiMessages(messages: ChatMessage[]): Content[]` — exactly the loop in `stream()` that builds `contents`
- [ ] `OpenAICompatProvider.ts`: Add `export` keyword to `buildSystemPrompt`
- [ ] Run `npm run build` to verify no TypeScript errors from exports

#### Phase 2: Provider unit tests (~20%)

**Files:** `src/__tests__/AnthropicProvider.test.ts`, `src/__tests__/OpenAIProvider.test.ts`, `src/__tests__/GeminiProvider.test.ts`, `src/__tests__/OpenAICompatProvider.test.ts`

**Tasks:**

- [ ] **`AnthropicProvider.test.ts`** — `describe("buildSystemPrompt")`:
  - Test: contains vault path
  - Test: includes `:::file-op` protocol
  - Test: omits context section when `activeFileContent` is null
  - Test: includes context section with correct markers when content provided
  - Test: truncates content at 8192 bytes
  - Test: content shorter than 8192 bytes is not truncated

- [ ] **`OpenAIProvider.test.ts`** — `describe("buildSystemPrompt")` (same 6 tests):
  - Same tests as Anthropic
- [ ] **`OpenAIProvider.test.ts`** — `describe("filterOpenAIModelId")`:
  - Test: `"gpt-4o"` → true
  - Test: `"gpt-3.5-turbo"` → true
  - Test: `"o1"` → true, `"o3"` → true
  - Test: `"claude-3"` → false
  - Test: `"gemini-1.5-pro"` → false
  - Test: `"text-davinci-003"` → false (not gpt- prefix)

- [ ] **`GeminiProvider.test.ts`** — `describe("buildSystemPrompt")` (same 6 tests as Anthropic)
- [ ] **`GeminiProvider.test.ts`** — `describe("mergeGeminiMessages")`:
  - Import `ChatMessage` type; no Gemini SDK needed (function is pure)
  - Test: single user message → `[{ role: "user", parts: [{text: "..."}] }]`
  - Test: user + assistant + user (alternating) → 3 entries, correct roles
  - Test: user + user consecutive → merged into single user entry (concatenated with `\n`)
  - Test: assistant + assistant consecutive → merged into single model entry
  - Test: empty messages array → `[]`
  - Test: last message is assistant → returns array without user-last guard (guard is in `stream()`, not `mergeGeminiMessages`)
    *(Note: the early-return-if-last-not-user logic lives in `stream()` after the merge — the extracted function just does the merging)*

- [ ] **`OpenAICompatProvider.test.ts`** — `describe("buildSystemPrompt")` (same 6 tests as Anthropic)

#### Phase 3: AgentChatTab P1 unit tests (~15%)

**Files:** `tests/unit/agent-chat-tab.unit.test.ts`

Add three new `describe` blocks at the end of the existing file:

**Tasks:**

- [ ] **`describe("clearHistory")`**:
  - Test: after send + complete, `tab.clearHistory()` → `tab.getHistory()` returns `[]`
  - Test: after `clearHistory()`, DOM shows empty state element again
  - Test: after `clearHistory()`, message elements are removed from DOM

- [ ] **`describe("context payload")`**:
  Update `mockApp` for these tests to return a mock active file and mock vault content:
  ```typescript
  const mockAppWithFile = {
    workspace: { getActiveFile: () => ({ path: "notes/active.md" } as TFile) },
    vault: {
      read: async () => "# Active Note\nSome content here",
      adapter: { basePath: "/test-vault" },
    },
  } as unknown as App;
  ```
  - Test: `runner.runCalls[0].context` (after send) contains `"/test-vault"` as `vaultPath`
  - Test: context includes `activeFileContent: "# Active Note\nSome content here"` when active file exists
  - Test: context includes `activeFileContent: null` when `getActiveFile()` returns null (use default `mockApp`)
  - Test: `activeFileContent` is truncated at 8192 bytes — construct a mock vault.read that returns `"x".repeat(20_000)`, verify context's `activeFileContent` field length ≤ 8192

- [ ] **`describe("Enter-key send")`**:
  - Test: simulate `KeyboardEvent("keydown", { key: "Enter" })` on the textarea → `runner.runCalls.length === 1`
  - Test: `Shift+Enter` does NOT trigger send — `runner.runCalls.length === 0`
  - *(Note: check AgentChatTab source to confirm keydown handler exists and Shift check)*

#### Phase 4: AgentRunner integration edge cases (~15%)

**Files:** `tests/integration/helpers/fakeAgent.ts`, `tests/integration/agent-runner.integration.test.ts`

**Tasks:**

- [ ] **`fakeAgent.ts`** — add two new script factories:
  ```typescript
  /** Write a script that emits text, prints to stderr, then exits 0. */
  export function writeStderrScript(tmpDir: string, stderrMessages: string[], stdoutChunks: string[]): string;
  /** Write a script that exits with a given non-zero code after optional output. */
  export function writeExitCodeScript(tmpDir: string, exitCode: number, stdoutChunks: string[]): string;
  ```
  - `writeStderrScript`: uses `process.stderr.write(msg)` + `process.stdout.write(chunk)` then exits 0
  - `writeExitCodeScript`: writes chunks to stdout then `process.exit(code)`

- [ ] **`agent-runner.integration.test.ts`** — add `describe("stderr events")`:
  - Test: runner emits `stderr` event with the text written to stderr by the script
  - Test: stderr output does not appear in `tokens` array

- [ ] **`agent-runner.integration.test.ts`** — add `describe("non-zero exit")`:
  - Test: script that exits with code 1 → runner emits `error` event with message containing "exit code"
  - Test: error message includes the non-zero exit code value

- [ ] **`agent-runner.integration.test.ts`** — add `describe("extraArgs passthrough")`:
  - Create a script that reads `process.argv` and writes it to stdout
  - Test: runner created with `extraArgs: ["--flag", "value"]` → tokens include those args in script's stdout output
  - *(This verifies the args reach the subprocess, not just that the runner stores them)*

#### Phase 5: AgentApiRunner file-op variant integration tests (~15%)

**Files:** `tests/integration/agent-api-runner.integration.test.ts`

Add to the existing `describe(":::file-op protocol parsing")` block or create new `describe` blocks:

**Tasks:**

- [ ] **write file-op**: `MockProviderAdapter` yields a `write` op block (`{"op":"write","path":"api-write.md","content":"hello"}`); verify `fileOpStarts[0].op === "write"` and `fileOpResults[0].result.ok === true`
- [ ] **delete file-op**: yields a `delete` op block; verify `fileOpStarts[0].op === "delete"`
- [ ] **rename file-op**: yields a `rename` op block (`{"op":"rename","oldPath":"old.md","newPath":"new.md"}`); verify `fileOpStarts[0].op === "rename"`
- [ ] **list file-op**: yields a `list` op block (`{"op":"list","path":"/"}`); verify `fileOpStarts[0].op === "list"`
- [ ] **file-op result failure**: `mockHandler.execute` returns `{ ok: false, error: "not found" }` for a read op; verify `fileOpResults[0].result.ok === false`
- [ ] Update `mockHandler` for these tests to support write/delete/rename/list ops (the existing stub returns a fixed `read` result; for other ops, returning `{ ok: true, result: {} }` is sufficient)

#### Phase 6: runnerFactory settings-level apiBaseUrl test (~5%)

**Files:** `tests/integration/runner-factory.integration.test.ts`

Add to the existing `describe("base URL env var override")` block:

**Tasks:**

- [ ] Test: when `agentConfig.apiBaseUrl` is set to a valid `http://` URL in settings (no env var), `createRunner` returns `AgentApiRunner` (settings-level override used)
- [ ] Test: when both `agentConfig.apiBaseUrl` (valid) and `TEST_BASE_URL_VAR` env var are set, the settings-level value takes precedence (verified by constructing settings with `apiBaseUrl` set and confirming no error runner returned)
- [ ] Test: when `agentConfig.apiBaseUrl` is an invalid URL, factory falls back gracefully (returns `AgentApiRunner` using the env var or SDK default, not an error runner)
- [ ] Note: these tests use the settings-level `apiKey` pattern (already established in Sprint 006 mode-switching tests) to avoid shell-env cache dependency

#### Phase 7: E2E Gemini chat interaction (~10%)

**Files:** `tests/e2e/helpers/mockApiServer.ts`, `tests/e2e/chat-interaction.e2e.test.ts`

**Tasks:**

- [ ] **`mockApiServer.ts`** — add Gemini route:
  - `POST /v1beta/models/:model:streamGenerateContent` → responds with the Gemini JSON array format (non-streaming):
    ```json
    [{"candidates":[{"content":{"parts":[{"text":"<RESPONSE>"}],"role":"model"},"finishReason":"STOP"}]}]
    ```
  - `GET /v1beta/models` → responds with:
    ```json
    {"models":[{"name":"models/gemini-test","supportedGenerationMethods":["generateContent"]}]}
    ```
  - Route dispatch: detect path prefix `/v1beta/` to branch to Gemini handler

- [ ] **`chat-interaction.e2e.test.ts`** — add `describe("chat-interaction: gemini")` block:
  - Pattern exactly mirrors the existing Anthropic and OpenAI describe blocks
  - Vault pre-seeded with Gemini enabled in API mode, `selectedModel: "gemini-test"`, settings-level `apiKey: "fake-gemini-key"`, `apiBaseUrl: mock server URL`
  - Test: send message → mock server returns canned response → `waitForAssistantMessage` passes
  - Test: `server.requestCount("/v1beta/models/gemini-test:streamGenerateContent") === 1` (or whichever path Gemini SDK uses)
  - Guard: `if (!binary) ctx.skip()`

### P0 (continued): Gemini baseURL production change

#### Phase 7a: Add baseURL to GeminiProvider (~5%)

**Files:** `src/providers/GeminiProvider.ts`, `src/AgentApiRunner.ts`

**Tasks:**
- [ ] `GeminiProvider.ts`: Add `constructor(apiKey: string, baseURL?: string)`. Store `baseURL` on the instance. Pass it as `requestOptions: { baseUrl: baseURL }` to `this.genAI.getGenerativeModel({ model, systemInstruction }, { baseUrl: baseURL })` when provided.
- [ ] `AgentApiRunner.ts`: In `createProvider()`, change the Gemini case from `new GeminiProvider(apiKey)` to `new GeminiProvider(apiKey, baseURL)` — same pattern as Anthropic and OpenAI.
- [ ] Run `npm run build` to verify no TypeScript errors.

**Note on Gemini SDK URL path**: Before implementing Phase 7 (mock server + E2E), verify the actual URL path the Google AI SDK uses when `requestOptions.baseUrl` is set. Expected: `POST /v1beta/models/{model}:streamGenerateContent`. Document the verified path in a comment in `mockApiServer.ts`.

### P1: Ship If Capacity Allows

- [ ] **AgentChatTab: `debugMode: true` path** — verify debug panel renders when `plugin.settings.debugMode = true` (currently untested; requires checking what AgentChatTab renders in debug mode)
- [ ] **FileOperationsHandler: `list` with nonexistent path** — currently the `list` test only covers a happy path; missing "folder not found" error case
- [ ] **FileOperationsHandler: `write` creates nested directories** — write to `"deep/nested/folder/file.md"` where no intermediate folders exist; verify `ensureFolder` is called and file is created

### Deferred

- YOLO mode E2E — separate concern, no blocking gap
- File-op protocol E2E (via mock server) — integration tests cover this thoroughly
- Cross-platform E2E (Windows, Linux) — macOS-only scope per Sprint 004
- Provider `listModels()` integration testing with real APIs — requires live network/keys; outside scope

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/providers/AnthropicProvider.ts` | Modify | Export `buildSystemPrompt` |
| `src/providers/OpenAIProvider.ts` | Modify | Export `buildSystemPrompt`, extract + export `filterOpenAIModelId` |
| `src/providers/GeminiProvider.ts` | Modify | Add `baseURL` param; export `buildSystemPrompt`, extract + export `mergeGeminiMessages` |
| `src/providers/OpenAICompatProvider.ts` | Modify | Export `buildSystemPrompt` |
| `src/AgentApiRunner.ts` | Modify | Pass `baseURL` to `GeminiProvider` in `createProvider()` |
| `src/__tests__/AnthropicProvider.test.ts` | Create | `buildSystemPrompt` unit tests (6 tests) |
| `src/__tests__/OpenAIProvider.test.ts` | Create | `buildSystemPrompt` (6) + `filterOpenAIModelId` (6) unit tests |
| `src/__tests__/GeminiProvider.test.ts` | Create | `buildSystemPrompt` (6) + `mergeGeminiMessages` (6) unit tests |
| `src/__tests__/OpenAICompatProvider.test.ts` | Create | `buildSystemPrompt` (6) unit tests |
| `tests/unit/agent-chat-tab.unit.test.ts` | Modify | Add clearHistory (3), context payload (4), Enter-key (2) tests |
| `tests/integration/helpers/fakeAgent.ts` | Modify | Add `writeStderrScript`, `writeExitCodeScript` factories |
| `tests/integration/agent-runner.integration.test.ts` | Modify | Add stderr, exit code, extraArgs describe blocks |
| `tests/integration/agent-api-runner.integration.test.ts` | Modify | Add write/delete/rename/list file-op tests + failure result test |
| `tests/integration/runner-factory.integration.test.ts` | Modify | Add settings-level apiBaseUrl override tests |
| `tests/e2e/helpers/mockApiServer.ts` | Modify | Add Gemini route handlers |
| `tests/e2e/chat-interaction.e2e.test.ts` | Modify | Add Gemini describe block |

## Definition of Done

- [ ] `npm run build` passes — no TypeScript errors from export additions
- [ ] `npm test` (existing unit tests) passes — all existing + new provider unit tests pass
- [ ] `npm run test-unit` passes — all existing + new AgentChatTab unit tests pass
- [ ] `make test-integration` passes — all existing + new integration tests pass
- [ ] `make test-e2e` runs (skips or passes) — no regressions; Gemini describe block skips gracefully when Obsidian is absent
- [ ] Four new `src/__tests__/*.test.ts` files created and passing
- [ ] `buildSystemPrompt` exported from all four provider files with `export` keyword (no behavior change)
- [ ] `filterOpenAIModelId` extracted as named export from `OpenAIProvider.ts`; `listModels()` uses it internally
- [ ] `mergeGeminiMessages` extracted as named export from `GeminiProvider.ts`; `stream()` uses it internally
- [ ] `mergeGeminiMessages` tests cover: single user, alternating, consecutive-same-role merge, empty array
- [ ] `filterOpenAIModelId` tests cover: gpt- prefix, o\d prefix, non-matching IDs
- [ ] AgentChatTab `clearHistory` test verifies: `getHistory()` returns `[]`, empty state re-appears, message elements removed
- [ ] AgentChatTab context payload tests verify: vaultPath present, active file content present (and absent), content truncated at 8192 bytes
- [ ] AgentChatTab Enter-key test verifies: Enter triggers send, Shift+Enter does not
- [ ] AgentRunner stderr test: `stderr` event fired with script's stderr text; text not in `tokens`
- [ ] AgentRunner exit-code test: non-zero exit → `error` event with message referencing exit code
- [ ] AgentRunner extraArgs test: args reach the subprocess (verified via subprocess output)
- [ ] AgentApiRunner write/delete/rename/list tests: each op type produces `fileOpStart` with correct `.op` and a `fileOpResult`
- [ ] AgentApiRunner file-op failure test: `mockHandler` returning `ok: false` → `fileOpResults[0].result.ok === false`
- [ ] runnerFactory settings-level `apiBaseUrl` takes precedence over env var — verified by integration test
- [ ] `mockApiServer.ts` Gemini routes respond correctly with non-streaming JSON array format
- [ ] Gemini E2E describe block: send message → response appears in chat UI; request count verified
- [ ] Gemini E2E describe block: skips gracefully when Obsidian binary is absent
- [ ] No new npm packages added
- [ ] No production behavior changes — all changes are exports or test additions

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `mergeGeminiMessages` extraction breaks existing Gemini streaming | Low | High | `npm run build` + `make test-integration` both run before committing |
| `filterOpenAIModelId` extraction changes model list behavior | Low | High | Same mitigation; extraction is pure refactor |
| Gemini SDK uses unexpected URL path for `streamGenerateContent` | Medium | Medium | Sprint task: verify actual SDK URL by reading Google AI SDK source or test in isolation; adapt mock route accordingly |
| AgentRunner subprocess arg test is environment-sensitive | Low | Medium | Use `process.execPath` (node) + a script that echoes `process.argv` — deterministic regardless of platform |
| Enter-key test depends on keydown handler implementation | Low | Low | Read AgentChatTab source before writing test; if handler uses `keydown`, simulate `keydown`; if `keypress`, adapt |

## Security Considerations

- All new code is test-only or adds `export` to existing pure functions — no new attack surface
- Exported `buildSystemPrompt` functions remain deterministic pure functions; exporting them does not change the plugin's runtime behavior
- `writeStderrScript` and `writeExitCodeScript` write `.mjs` files to `os.tmpdir()` — same pattern as existing `writeFakeScript`
- Gemini mock route bound to `127.0.0.1` loopback only (same as existing mock server)

## Observability & Rollback

- Post-ship verification: all four test commands pass → gaps are filled
- Rollback: every change is either a test file (delete to revert) or an `export` keyword addition (remove to revert); zero production risk

## Documentation

- No documentation updates required — all changes are test additions and minor exports; no new public API or user-facing behavior

## Dependencies

- Sprint 004–006 complete: `fakeAgent.ts`, `obsidianStub.ts`, `vitest.unit.config.ts`, `mockApiServer.ts` all present and operational
- No new npm packages
- Obsidian binary on test machine for E2E (skips gracefully if absent)

## Open Questions

1. What exact URL path does the Google Generative AI SDK use for `streamGenerateContent` requests? Needs verification from SDK source or a trace before implementing the Gemini mock route.
2. Does `AgentChatTab` have a keydown handler on the textarea, and does it check for `Shift` key? Needs a quick read of `src/AgentChatTab.ts` before writing the Enter-key test.
