# Sprint 005: API Endpoint Env Var Overrides + Chat E2E Tests

**Status:** Planned

## Overview

Sprints 001–004 delivered a feature-complete plugin with integration tests and a Playwright/CDP E2E suite. The E2E suite intentionally deferred chat interaction because it requires live API endpoints and real credentials — both introduce cost and flakiness. This sprint removes that blocker.

The approach is two-pronged:

1. **Production code (minimal, additive)**: Add one env var per API provider that overrides the SDK's default base URL. Env vars follow the existing `OBSIDIAN_AI_AGENT_SIDEBAR_` namespace (e.g., `OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL`). When absent, provider behavior is completely unchanged. No settings UI changes. No CLI runner changes.

2. **E2E tests (new)**: A lightweight in-process mock HTTP server serves canned SSE responses in the Anthropic and OpenAI wire formats. The E2E harness is refactored to inject test-specific env vars by spawning the Obsidian binary directly (instead of via `open -a`) with an explicit Node.js `spawn` `env` option. A new `chat-interaction.e2e.test.ts` verifies that a message typed in the sidebar produces a response in the chat UI.

No new npm dependencies. No settings persistence changes.

## Use Cases

1. **E2E mock test (Anthropic)**: Pre-seed vault with Claude enabled in API mode + `selectedModel: "mock-model"`. Launch Obsidian with `OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL=http://127.0.0.1:PORT` and `OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY=fake-key`. Send a message → mock server returns a canned response → verify text appears in chat UI.
2. **E2E mock test (OpenAI)**: Same pattern with `OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_BASE_URL` / `OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_API_KEY`, Claude's codex agent enabled in API mode.
3. **Local dev proxy**: Developer sets `OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL=http://localhost:5000` in shell profile to route plugin calls to a local proxy. No code change required.
4. **No override (default)**: Env var absent → SDK uses its built-in default endpoint. Existing behavior preserved.
5. **Invalid env var (defense-in-depth)**: Env var set to malformed URL or empty string → provider silently falls back to SDK default. No crash, no error runner.

## Architecture

```
Production code changes:
  src/providers.ts                     add apiBaseUrlEnvVar to ProviderConfig
  src/providers/AnthropicProvider.ts   accept optional baseURL param
  src/providers/OpenAIProvider.ts      accept optional baseURL param
  src/providers/GeminiProvider.ts      accept optional baseURL param (P1)
  src/AgentApiRunner.ts                thread baseURL to all provider constructors
  src/runnerFactory.ts                 read + validate base URL from shellEnv; pass to runner
  src/AgentChatTab.ts                  add data-testid to chat message + input elements

E2E infrastructure:
  tests/e2e/helpers/electronHarness.ts refactor to direct binary spawn with env option
  tests/e2e/helpers/vaultFactory.ts    add agentSettings parameter for data.json seeding
  tests/e2e/helpers/mockApiServer.ts   new: mock HTTP server (Anthropic + OpenAI SSE)
  tests/e2e/helpers/selectors.ts       add chat UI selectors

New E2E test:
  tests/e2e/chat-interaction.e2e.test.ts

New integration tests:
  tests/integration/runner-factory.integration.test.ts  add URL override + validation tests
```

### Env Var Mapping

```
OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL  → AnthropicProvider baseURL
OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_BASE_URL     → OpenAIProvider baseURL
OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_BASE_URL     → GeminiProvider requestOptions.baseUrl (P1)
```
`openai-compat` is excluded — it already uses settings-persisted `openaiCompatBaseUrl`.

### URL Validation

A shared validator (`isValidBaseUrl(s: string): boolean`) lives in `runnerFactory.ts`:
```ts
function isValidBaseUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}
```
`runnerFactory` validates before passing to `AgentApiRunner`. If invalid or empty, `baseURL` is passed as `undefined` (provider uses its SDK default). Provider constructors also do a lightweight validation as defense-in-depth.

### Harness Env Injection

Current harness uses `open -a AppPath vaultPath --args --remote-debugging-port=PORT`. The `open -a` approach makes env injection unreliable (Launch Services may not preserve parent env). The fix: spawn the binary directly without a vault path positional arg (which would trigger CLI mode), relying on the pre-registered vault in `obsidian.json`:

```ts
// launchObsidianMacOS AFTER refactor:
spawn(binaryPath, [`--remote-debugging-port=${port}`, "--inspect=0"], {
  detached: true,
  stdio: "ignore",
  env: { ...process.env, ...extraEnv },
});
```

The vault registration in `obsidian.json` (already done before the spawn call) ensures Obsidian opens the test vault without needing a positional vault arg.

### Mock Server Protocol

Node.js `http.createServer`, bound to `127.0.0.1` only (loopback).

**POST `/v1/messages`** (Anthropic SSE):
```
HTTP 200  Content-Type: text/event-stream

event: message_start
data: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"claude-test","stop_reason":null}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"<RESPONSE>"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}

event: message_stop
data: {"type":"message_stop"}
```

**POST `/v1/chat/completions`** (OpenAI SSE):
```
HTTP 200  Content-Type: text/event-stream

data: {"id":"chatcmpl-test","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant","content":"<RESPONSE>"},"finish_reason":null,"index":0}]}

data: {"id":"chatcmpl-test","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop","index":0}]}

data: [DONE]
```

**GET `/v1/models`** (Anthropic/OpenAI models list):
```json
{"data":[{"id":"mock-model","object":"model"}]}
```

**POST `/v1beta/models/*:streamGenerateContent`** (Gemini — P1):
```json
[{"candidates":[{"content":{"parts":[{"text":"<RESPONSE>"}],"role":"model"},"finishReason":"STOP"}]}]
```

**GET `/v1beta/models`** (Gemini models list — P1):
```json
{"models":[{"name":"models/gemini-test","supportedGenerationMethods":["generateContent"]}]}
```

Any other route → `404`.

`MockServer` interface:
```ts
interface MockServer {
  port: number;
  setResponse(text: string): void;
  requestCount(path: string): number;
  close(): Promise<void>;
}
```

## Implementation Plan

### P0: Must Ship

#### Phase 1: ProviderConfig extension (~5%)

**Files:** `src/providers.ts`

- [ ] Add `apiBaseUrlEnvVar?: string` to `ProviderConfig` interface (with JSDoc: "Optional env var to override the provider's API base URL. Intended for local proxies and test mock servers.")
- [ ] Set `apiBaseUrlEnvVar: "OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL"` for Anthropic
- [ ] Set `apiBaseUrlEnvVar: "OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_BASE_URL"` for OpenAI
- [ ] Set `apiBaseUrlEnvVar: "OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_BASE_URL"` for Google (P1: can add now; only used when GeminiProvider supports it)
- [ ] Leave GitHub and openai-compat with no `apiBaseUrlEnvVar` (CLI-only / settings-based)

#### Phase 2: Provider constructor updates (~15%)

**Files:** `src/providers/AnthropicProvider.ts`, `src/providers/OpenAIProvider.ts`

- [ ] `AnthropicProvider`: add `constructor(apiKey: string, baseURL?: string)`. Pass `baseURL` to `new Anthropic({ apiKey, dangerouslyAllowBrowser: true, ...(baseURL ? { baseURL } : {}) })`. Add `isValidBaseUrl(baseURL)` guard.
- [ ] `OpenAIProvider`: add `constructor(apiKey: string, baseURL?: string)`. Pass `baseURL` to `new OpenAI({ apiKey, dangerouslyAllowBrowser: true, ...(baseURL ? { baseURL } : {}) })`. Same guard.

#### Phase 3: AgentApiRunner + runnerFactory updates (~15%)

**Files:** `src/AgentApiRunner.ts`, `src/runnerFactory.ts`

- [ ] `AgentApiRunner.createProvider()`: pass `baseURL` to `AnthropicProvider` and `OpenAIProvider` constructors (already passed to `OpenAICompatProvider`; Gemini is P1)
- [ ] `runnerFactory.createRunner()`: add `isValidBaseUrl` helper function. After reading `apiKey` from `shellEnv`, read and validate base URL:
  ```ts
  const rawBaseUrl = provider.apiBaseUrlEnvVar ? shellEnv[provider.apiBaseUrlEnvVar]?.trim() : undefined;
  const baseURL = rawBaseUrl && isValidBaseUrl(rawBaseUrl) ? rawBaseUrl : undefined;
  if (rawBaseUrl && !baseURL && settings.debugMode) {
    console.debug(`[runnerFactory] ${agentId}: base URL override '${rawBaseUrl}' is invalid or not http(s); using SDK default`);
  }
  ```
  Pass `baseURL` to `new AgentApiRunner(agentId, apiKey, model, fileOpsHandler, settings.debugMode, baseURL)`
- [ ] Ensure `isValidBaseUrl` is NOT called for `openai-compat` provider (which uses settings-based URL, not env var) — explicitly test this in integration tests

#### Phase 4: electronHarness refactor for env injection (~15%)

**Files:** `tests/e2e/helpers/electronHarness.ts`

> **⚠️ Spike first**: Before implementing Phases 5–8, verify that spawning the Obsidian binary directly (without positional vault path args) opens the GUI with the pre-registered vault. If this does not work (i.e., Obsidian shows a vault picker or runs in CLI mode), fall back to the `openai-compat` E2E approach (write `openaiCompatBaseUrl` to `data.json`; env injection is not needed for openai-compat). The production env var changes (Phases 1–3) still ship regardless.

- [ ] **Spike**: Manually run `Contents/MacOS/Obsidian --remote-debugging-port=9229` with a pre-registered test vault in `obsidian.json`. Confirm GUI opens with correct vault and CDP connects. Document result in commit message / harness comment.
- [ ] Add `extraEnv?: Record<string, string>` to `launchObsidian` options interface
- [ ] Refactor `launchObsidianMacOS` to spawn the binary directly (without `open -a`):
  ```ts
  spawn(binaryPath, [`--remote-debugging-port=${port}`, "--inspect=0"], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ...(extraEnv ?? {}) },
  });
  ```
  (The vault is already registered in `obsidian.json` by `registerTestVault` before this call; Obsidian will open it without a positional vault arg)
- [ ] Keep all other harness logic unchanged: CDP connect, trust modal handler, vault registration/cleanup
- [ ] Update the comment block at the top of the file to document the new spawn strategy
- [ ] **Verification gate**: Run existing E2E tests (`plugin-load`, `sidebar-open`, `settings-ui`) after the refactor. All must pass before proceeding to Phase 8. If they fail, revert Phase 4 and pivot to the openai-compat fallback strategy.

#### Phase 5: vaultFactory agent settings seeding (~5%)

**Files:** `tests/e2e/helpers/vaultFactory.ts`

- [ ] Add `agentSettings?: Record<string, Partial<AgentConfig>>` parameter to `createTestVault`
- [ ] If `agentSettings` provided, deep-merge with the default disabled agent config when writing `data.json`:
  ```ts
  // e.g. agentSettings = { claude: { enabled: true, accessMode: "api", selectedModel: "mock-model" } }
  ```
- [ ] Existing callers pass no argument; behavior unchanged

#### Phase 6: Mock API server helper (~15%)

**Files:** `tests/e2e/helpers/mockApiServer.ts` (new)

- [ ] Export `startMockApiServer(opts?: { response?: string }): Promise<MockServer>`
- [ ] Server binds to `127.0.0.1` only (`server.listen(0, "127.0.0.1", ...)`)
- [ ] Request handler dispatches on method + path; implements exact SSE formats above
- [ ] Tracks request count per path; `requestCount(path)` returns count
- [ ] `setResponse(text)` updates the canned response for subsequent requests
- [ ] `close()` calls `server.close()` and returns a Promise

#### Phase 7: Chat UI data-testid attributes (~5%)

**Files:** `src/AgentChatTab.ts`

- [ ] Add `data-testid="ai-agent-chat-message-user"` to user message container elements (both in `renderMessage` for history and in the live streaming path for new messages)
- [ ] Add `data-testid="ai-agent-chat-message-assistant"` to assistant message container elements — **must be set on the streaming container created by `createStreamingMessage` so it is queryable during streaming**, not only after completion
- [ ] Add `data-testid="ai-agent-chat-input"` to the message input textarea
- [ ] Add `data-testid="ai-agent-chat-submit"` to the submit button
- [ ] Add `data-testid="ai-agent-chat-error"` to error message elements rendered in the chat (this is the selector used by the error-path E2E test — avoids ambiguous heuristic matching)
- [ ] Run `npm run build` to verify no TypeScript errors

#### Phase 8: Chat interaction E2E tests (~20%)

**Files:** `tests/e2e/chat-interaction.e2e.test.ts`, `tests/e2e/helpers/selectors.ts`

- [ ] Add to `selectors.ts`:
  ```ts
  export const CHAT_INPUT = '[data-testid="ai-agent-chat-input"]';
  export const CHAT_SUBMIT = '[data-testid="ai-agent-chat-submit"]';
  export const CHAT_MSG_ASSISTANT = '[data-testid="ai-agent-chat-message-assistant"]';
  export const CHAT_MSG_USER = '[data-testid="ai-agent-chat-message-user"]';
  ```
- [ ] Test structure: two `describe` blocks — `anthropic` and `openai`:
  ```
  describe("chat-interaction: anthropic") {
    beforeAll:
      1. Start mock server
      2. Create vault with claude enabled in API mode + selectedModel: "mock-model"
      3. Launch Obsidian with ANTHROPIC_API_KEY=fake-key, ANTHROPIC_BASE_URL=http://127.0.0.1:PORT
      4. Wait for workspace, open sidebar, click Claude tab
    afterAll: quit Obsidian, cleanup vault, close mock server

    it("sends a message and displays assistant response in chat")
    it("displays an error in chat when mock server is unavailable")
  }
  ```
- [ ] `sendChatMessage(page, text)`: click CHAT_INPUT, type text, press Enter (or click CHAT_SUBMIT)
- [ ] `waitForAssistantMessage(page, expectedText, timeout)`: wait for `CHAT_MSG_ASSISTANT` to contain `expectedText`, timeout 15s
- [ ] "sends message" test: mock server response = `"Hello from mock"` → verify `waitForAssistantMessage(page, "Hello from mock")` passes AND `server.requestCount("/v1/messages") === 1` (Anthropic) or `server.requestCount("/v1/chat/completions") === 1` (OpenAI)
- [ ] "error path" test: `await server.close()` → `sendChatMessage` → wait for `[data-testid="ai-agent-chat-error"]` to appear; timeout 15s (precise selector, not heuristic matching)
- [ ] Each `describe` block guards with `if (!binary) ctx.skip()` in beforeAll
- [ ] Screenshots on failure saved to `tests/e2e/artifacts/`

#### Phase 9: Integration tests for URL override (~5%)

**Files:** `tests/integration/runner-factory.integration.test.ts`

- [ ] Add a `describe("base URL env var override")` block:
  - Test: valid `http://127.0.0.1:9999` URL for Anthropic → `createRunner` passes `baseURL` to `AgentApiRunner` (verify via mock provider adapter injected via optional provider param)
  - Test: invalid URL `"not-a-url"` → `baseURL` is `undefined` (fallback to provider default)
  - Test: empty string env var → treated as absent (same as no env var)
  - Test: `https://` URL is accepted as valid
- [ ] Note: tests must clear `resolveShellEnv` module cache between tests. Use `vi.resetModules()` in `beforeEach` or stub `resolveShellEnv` directly.

### P1: Ship If Capacity Allows

- [ ] **GeminiProvider base URL**: accept optional `baseURL?: string`, pass as `requestOptions.baseUrl` to `getGenerativeModel()`. Add `OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_BASE_URL` env var read in `runnerFactory`.
- [ ] **Gemini E2E test**: add `describe("chat-interaction: gemini")` block in `chat-interaction.e2e.test.ts` using non-streaming JSON array mock response format
- [ ] **Model dropdown via mock**: open settings in API mode with mock running → verify dropdown shows `mock-model` (exercises `listModels()` through the override)

### Deferred

- File-op protocol E2E (via mock server) — integration tests already cover this thoroughly; adds significant test complexity
- Cross-platform E2E (Windows, Linux) — local macOS dev scope per Sprint 004
- `openai-compat` URL override via env var — already works via settings; not needed for test scenario
- YOLO mode E2E coverage — separate concern

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/providers.ts` | Modify | Add `apiBaseUrlEnvVar` to `ProviderConfig`; set for Anthropic, OpenAI, Google |
| `src/providers/AnthropicProvider.ts` | Modify | Accept optional `baseURL` constructor param; pass to Anthropic SDK |
| `src/providers/OpenAIProvider.ts` | Modify | Accept optional `baseURL` constructor param; pass to OpenAI SDK |
| `src/providers/GeminiProvider.ts` | Modify (P1) | Accept optional `baseURL`; pass as `requestOptions.baseUrl` |
| `src/AgentApiRunner.ts` | Modify | Pass `baseURL` to all provider constructors in `createProvider()` |
| `src/runnerFactory.ts` | Modify | Read + validate base URL env var from shellEnv; pass to `AgentApiRunner` |
| `src/AgentChatTab.ts` | Modify | Add `data-testid` to streaming + historical chat message containers, input, submit |
| `tests/e2e/helpers/electronHarness.ts` | Modify | Refactor to direct binary spawn with `env` option; add `extraEnv` to launch options |
| `tests/e2e/helpers/vaultFactory.ts` | Modify | Add `agentSettings` param for pre-seeding `data.json` |
| `tests/e2e/helpers/mockApiServer.ts` | Create | In-process mock HTTP server (Anthropic/OpenAI SSE formats, request capture) |
| `tests/e2e/helpers/selectors.ts` | Modify | Add chat UI selectors |
| `tests/e2e/chat-interaction.e2e.test.ts` | Create | Chat E2E: Anthropic + OpenAI API mode with mock server |
| `tests/integration/runner-factory.integration.test.ts` | Modify | Add URL override validation tests |

## Definition of Done

- [ ] `npm run build` passes — no TypeScript errors
- [ ] `npm test` (unit tests) passes — no regressions
- [ ] `make test-integration` passes — no regressions; URL override integration tests pass
- [ ] `make test-e2e` passes on a machine with Obsidian installed; skips cleanly on a machine without Obsidian
- [ ] Existing E2E tests (`plugin-load`, `sidebar-open`, `settings-ui`) still pass after harness refactor
- [ ] Harness refactor verified: spawn binary directly (not `open -a`) and confirm Obsidian opens the registered vault
- [ ] Env var absent → provider uses SDK default endpoint (no regression; verified by `npm run build` + existing tests)
- [ ] Env var set to valid `http(s)://` URL → provider routes to that URL (verified by Anthropic + OpenAI E2E tests passing)
- [ ] Env var set to invalid value or empty string → provider falls back to SDK default, no crash (verified by integration test)
- [ ] Anthropic E2E: send message → `"Hello from mock"` appears in chat UI
- [ ] OpenAI E2E: send message → `"Hello from mock"` appears in chat UI
- [ ] Error path E2E: mock server stopped → error indicator appears in chat UI
- [ ] Mock server `requestCount()` used in E2E tests to assert exactly one provider request per message
- [ ] Mock server binds to `127.0.0.1` only (loopback)
- [ ] `electron.launch` not used; spawn with explicit `env` option used instead
- [ ] `extraEnv` merge order: `{ ...process.env, ...extraEnv }` (test vars override parent)
- [ ] `data-testid="ai-agent-chat-message-assistant"` is on the element created by `createStreamingMessage` (visible during streaming, not only after)
- [ ] Mock server `close()` called in `afterAll` in all test files that create one
- [ ] `agentSettings` vaultFactory param: existing callers pass no arg; behavior unchanged
- [ ] Integration test: `resolveShellEnv` module cache handled correctly (tests use `vi.mock('../../src/shellEnv')` or equivalent; do not share cached state)
- [ ] `openai-compat` and `copilot` (CLI-only) do NOT use the env var base URL path — verified by integration test or code review
- [ ] Invalid URL override emits a debug log in `debugMode`; verified by adding a DoD line: "if `debugMode=true` and URL override is malformed, a debug log message appears in the console"
- [ ] After each E2E test file, no Obsidian process remains running — verified by checking `isObsidianRunning()` returns false in `afterAll` cleanup
- [ ] Phase 4 spike result documented: spawn approach confirmed working (or fallback to openai-compat E2E documented with rationale)
- [ ] Mock server is confirmed listening (server start awaited) before `launchObsidian()` is called in `beforeAll`
- [ ] Debug log for invalid URL override does not include API key value
- [ ] Mock SSE format validated: before full E2E implementation, a standalone Node.js script verifies that the mock server's response is parseable by each SDK; result committed as a comment in `mockApiServer.ts`

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Direct binary spawn triggers Obsidian CLI mode | Medium | High | Sprint task includes verifying this during harness refactor phase; fallback is `open -a` + temporary `process.env` mutation (less clean but functional on macOS) |
| Anthropic SDK ignores `baseURL` for streaming path | Low | High | Both Anthropic and OpenAI SDKs document this constructor option; verify with a quick manual test against mock server before full implementation |
| Mock SSE format not exactly matching SDK parser | Medium | High | Test each provider's mock response in isolation via a simple Node.js script before wiring into E2E |
| `resolveShellEnv` module cache causes integration test flakiness | Medium | Medium | Use `vi.resetModules()` in `beforeEach` for URL override tests, or stub `shellEnv` module directly |
| Settings not loaded before plugin runs (data.json race) | Low | Medium | Pre-seed `data.json` before vault registration; Obsidian reads it on plugin init |
| Harness refactor causes existing E2E tests to fail | Low | High | Run existing E2E suite immediately after Phase 4 to catch regressions before adding new tests |

## Security Considerations

- **Mock server loopback-only**: Binds to `127.0.0.1`; no external network exposure during tests
- **Fake API keys**: Placeholder strings never committed to git; only injected ephemerally via test env
- **URL validation**: Primary validation in `runnerFactory` — accepts only `http://` or `https://` after URL parsing; invalid/empty → `undefined` (provider uses hardcoded SDK default)
- **Env merge order**: `{ ...process.env, ...extraEnv }` — test vars override parent process env. This is intentional. Tests cannot accidentally expose real production keys since the override goes the other direction.
- **No user vault touched**: Mock server and env injection are test-only; no production plugin code reads a mock URL unless the env var is set
- **No new attack surface for end users**: The `apiBaseUrlEnvVar` override requires the user to set an env var in their shell profile — same trust level and mechanism as `apiKeyEnvVar`

## Observability & Rollback

- **Post-ship verification**: Run `make test-e2e`; new chat tests pass → env injection + provider baseURL routing works correctly; existing tests still pass → no regression
- **Correctness proof**: `server.requestCount(path) === 1` asserts the Obsidian process actually contacted the mock server (not the real API)
- **Rollback**: All production changes are additive (new optional constructor params, new `runnerFactory` env var reads with safe fallback). To rollback: revert the `runnerFactory` `baseURL` read lines; providers still work without the optional param.

## Documentation

- [ ] Update `tests/e2e/README.md`: document mock server helper, env var override pattern, how to run chat interaction tests
- [ ] Add JSDoc to `apiBaseUrlEnvVar` field in `ProviderConfig`: `/** Optional env var to override the provider's API base URL. Intended for local proxies and mock test servers. When unset, the SDK default endpoint is used. */`

## Dependencies

- Sprint 004 complete — `vaultFactory`, `electronHarness`, `obsidianBinary`, `selectors` helpers exist
- No new npm packages
- Node.js `http` module (built-in)
- Obsidian desktop app on test machine (E2E tests skip gracefully if absent)
- `main.js` must be built before E2E — enforced by `make test-e2e` depending on `build` target

## Devil's Advocate Critiques Addressed

*From Codex's devil's advocate review:*

- **Binary spawn is unverified**: Converted Phase 4 into an explicit spike-first step; if direct spawn fails, plan pivots to openai-compat E2E approach ✓
- **Silent fallback masks misconfiguration**: Added debug-mode log in `runnerFactory` when URL override is present but invalid ✓
- **Error-path test heuristic**: Replaced ambiguous multi-condition assertion with precise `[data-testid="ai-agent-chat-error"]` selector ✓
- **No DoD for CLI/openai-compat isolation**: Added explicit DoD item verifying those paths don't use env URL ✓
- **Teardown hygiene**: Added DoD item for no orphaned Obsidian process after each test file ✓
- **Mock SSE format not verified**: Added DoD item requiring mock format validated against SDK before full E2E implementation ✓

*Critiques rejected:*
- **URL validation too narrow** (`http/https` check): Sufficient for test use case; SDK handles further malformed URL behavior ✓ (rejected)
- **"No new dependencies" pushes risk into test code**: Mock server is ~100 lines; adding a dep for this would be over-engineering ✓ (rejected)
- **data-testid coupling to streaming internals**: This is coupling to our own rendering code; intentional and correct ✓ (rejected)
- **Repeated-run flake tolerance as DoD gate**: Aspirational; not practical as explicit DoD criterion ✓ (rejected)
- **Mock server API too narrow**: Single-response mock is sufficient for this sprint; extend later ✓ (rejected)

## Open Questions

1. **Direct binary spawn verification**: Does spawning `Contents/MacOS/Obsidian --remote-debugging-port=PORT` (without vault path) open the GUI with the pre-registered vault? Verify in Phase 4 before implementing Phase 8.
2. **`resolveShellEnv` cache and integration tests**: Best approach to isolate the module-level promise cache in URL override integration tests — `vi.resetModules()` or `vi.mock("../../src/shellEnv")`?
