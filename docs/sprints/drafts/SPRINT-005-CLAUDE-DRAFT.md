# Sprint 005: API Endpoint Env Var Overrides + Chat E2E Tests

## Overview

Sprints 001–004 delivered a feature-complete plugin with integration tests and a Playwright E2E suite. The E2E suite intentionally deferred chat interaction because exercising the chat UI requires live API endpoints and real credentials — both introduce cost and flakiness. This sprint removes that constraint.

The approach is two-pronged:

1. **Production code** (minimal): Add one env var per API provider that overrides the SDK's default base URL. Env vars follow the existing `OBSIDIAN_AI_AGENT_SIDEBAR_` namespace. When absent, provider behavior is unchanged. This is a direct extension of the pattern already used for API keys.

2. **E2E tests** (new): A lightweight in-process mock HTTP server serves canned SSE responses in each provider's wire format. Tests inject the server URL and a fake API key into the Obsidian process via Playwright's `electron.launch({ env })`. A new `chat-interaction.e2e.test.ts` verifies that a message typed in the sidebar produces a response in the chat UI.

No new npm dependencies. No settings UI changes. No changes to CLI runner paths.

## Use Cases

1. **E2E mock test (Anthropic)**: Set `OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL=http://localhost:PORT` and `OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY=fake-key` via Playwright env injection → enable Claude in API mode → send a message → mock server returns a canned response → verify text appears in chat UI.
2. **E2E mock test (OpenAI)**: Same pattern with `OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_BASE_URL` / `OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_API_KEY`.
3. **E2E mock test (Gemini)**: Same pattern with `OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_BASE_URL` / `OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_API_KEY`.
4. **Local dev override**: Developer sets `OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL=http://localhost:5000` in shell profile to route Obsidian plugin calls to a local proxy. No code change required.
5. **No override (default)**: Env var absent → SDK uses its built-in default endpoint. Existing behavior preserved.

## Architecture

```
Production code changes (minimal):
  src/providers.ts            add apiBaseUrlEnvVar to ProviderConfig
  src/providers/AnthropicProvider.ts   accept optional baseURL in constructor
  src/providers/OpenAIProvider.ts      accept optional baseURL in constructor
  src/providers/GeminiProvider.ts      accept optional baseURL; pass via requestOptions
  src/AgentApiRunner.ts       pass baseURL to createProvider() for all provider types
  src/runnerFactory.ts        read base URL env var from shellEnv; pass to AgentApiRunner

E2E test infrastructure:
  tests/e2e/helpers/mockApiServer.ts   in-process mock HTTP server (Node http module)
  tests/e2e/helpers/electronHarness.ts add env option to electron.launch()

New E2E tests:
  tests/e2e/chat-interaction.e2e.test.ts
```

### Env Var Mapping

```
OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL   → AnthropicProvider baseURL
OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_BASE_URL      → OpenAIProvider baseURL
OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_BASE_URL      → GeminiProvider requestOptions.baseUrl
```
(openai-compat already uses settings-persisted URL; no env var added)

### Mock Server Protocol

The mock server is a plain Node.js `http.createServer` instance. It listens on a random available port (via `server.listen(0)`) and handles two routes:

**POST `/v1/messages`** (Anthropic format):
```
HTTP/1.1 200 OK
Content-Type: text/event-stream

event: message_start
data: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-6","stop_reason":null}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"<CANNED_RESPONSE>"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_stop
data: {"type":"message_stop"}
```

**POST `/v1/chat/completions`** (OpenAI format):
```
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"id":"chatcmpl-test","choices":[{"delta":{"content":"<CANNED_RESPONSE>"},"finish_reason":null}]}

data: {"id":"chatcmpl-test","choices":[{"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**POST `/v1beta/models/<model>:streamGenerateContent`** (Gemini format):
```
HTTP/1.1 200 OK
Content-Type: application/json

[{"candidates":[{"content":{"parts":[{"text":"<CANNED_RESPONSE>"}],"role":"model"},"finishReason":"STOP"}]}]
```

**GET `/v1/models`** and **GET `/v1beta/models`**: Return minimal model list stubs.

The mock server's canned response is configurable per test (default: `"Hello from mock"`).

### Provider baseURL threading

```
runnerFactory.createRunner()
  → shellEnv = await resolveShellEnv()
  → apiKey = shellEnv[detection.apiKeyVar]
  → baseURL = provider.apiBaseUrlEnvVar ? shellEnv[provider.apiBaseUrlEnvVar] : undefined
  → new AgentApiRunner(agentId, apiKey, model, fileOpsHandler, debugMode, baseURL)

AgentApiRunner.createProvider(agentId, apiKey, baseURL?)
  → "claude"   → new AnthropicProvider(apiKey, baseURL)
  → "codex"    → new OpenAIProvider(apiKey, baseURL)
  → "gemini"   → new GeminiProvider(apiKey, baseURL)
  → "openai-compat" → new OpenAICompatProvider(apiKey, baseURL ?? config.baseUrl)
```

### E2E test lifecycle

```
beforeAll:
  1. Start mock server → get port
  2. Launch Obsidian with env = {
       OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY: "fake-key",
       OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL: "http://127.0.0.1:<port>",
       ...process.env  // preserve existing env
     }
  3. Navigate to settings, enable Claude in API mode
  4. Open sidebar → wait for agent tab

it("sends message and receives response"):
  5. Type message in input
  6. Submit (Enter or click Send)
  7. Wait for [data-testid="ai-agent-chat-message-assistant"] to appear
  8. Verify text content contains "Hello from mock"

afterAll:
  9. quitObsidian, cleanup vault, stop mock server
```

## Implementation Plan

### P0: Must Ship

#### Phase 1: ProviderConfig extension (~5%)

**Files:**
- `src/providers.ts`

**Tasks:**
- [ ] Add `apiBaseUrlEnvVar?: string` field to `ProviderConfig` interface
- [ ] Set values:
  - Anthropic: `apiBaseUrlEnvVar: "OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL"`
  - OpenAI: `apiBaseUrlEnvVar: "OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_BASE_URL"`
  - Google: `apiBaseUrlEnvVar: "OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_BASE_URL"`
  - GitHub, openai-compat: no `apiBaseUrlEnvVar` (CLI-only / already settings-based)

#### Phase 2: Provider constructor updates (~15%)

**Files:**
- `src/providers/AnthropicProvider.ts`
- `src/providers/OpenAIProvider.ts`
- `src/providers/GeminiProvider.ts`

**Tasks:**
- [ ] `AnthropicProvider`: accept optional `baseURL?: string` constructor param; pass to `new Anthropic({ apiKey, dangerouslyAllowBrowser: true, baseURL })`; if `baseURL` is provided, validate it starts with `http://` or `https://` — if invalid, omit it (use SDK default)
- [ ] `OpenAIProvider`: accept optional `baseURL?: string` constructor param; pass to `new OpenAI({ apiKey, dangerouslyAllowBrowser: true, baseURL })`; same URL validation
- [ ] `GeminiProvider`: accept optional `baseURL?: string` constructor param; store as `this.requestOptions = baseURL ? { baseUrl: baseURL } : {}`; pass `this.requestOptions` to `getGenerativeModel()` calls

#### Phase 3: AgentApiRunner + runnerFactory updates (~15%)

**Files:**
- `src/AgentApiRunner.ts`
- `src/runnerFactory.ts`

**Tasks:**
- [ ] `AgentApiRunner.createProvider()`: pass `baseURL` to `AnthropicProvider`, `OpenAIProvider`, and `GeminiProvider` constructors (already passed to `OpenAICompatProvider`)
- [ ] `runnerFactory.createRunner()`: after reading `apiKey` from `shellEnv`, also read `baseURL`:
  ```ts
  const baseURL = provider.apiBaseUrlEnvVar ? shellEnv[provider.apiBaseUrlEnvVar] : undefined;
  ```
  Pass `baseURL` to `new AgentApiRunner(...)` — the `baseURL` parameter already exists in the constructor signature

#### Phase 4: electronHarness env injection (~10%)

**Files:**
- `tests/e2e/helpers/electronHarness.ts`

**Tasks:**
- [ ] Read current `launchObsidian` signature; add optional `extraEnv?: Record<string, string>` parameter
- [ ] In `electron.launch()` call, merge: `env: { ...process.env, ...extraEnv }` — spread order ensures `extraEnv` overrides but parent env is preserved
- [ ] Update `quitObsidian` and any callers in existing test files to pass `extraEnv` as empty/undefined (no-op change)

#### Phase 5: Mock API server helper (~20%)

**Files:**
- `tests/e2e/helpers/mockApiServer.ts`

**Tasks:**
- [ ] Export `interface MockServerOptions { response?: string }`
- [ ] Export `interface MockServer { port: number; close(): Promise<void>; setResponse(r: string): void }`
- [ ] Export `startMockApiServer(opts?: MockServerOptions): Promise<MockServer>`
  - Creates `http.createServer` with request handler
  - Calls `server.listen(0)` (random available port)
  - Returns `{ port, close, setResponse }`
- [ ] Request handler dispatches by `req.url`:
  - `POST /v1/messages` → Anthropic SSE response (see format above)
  - `POST /v1/chat/completions` → OpenAI SSE response
  - `POST /v1beta/models/*:streamGenerateContent` → Gemini JSON array response (non-streaming; Google SDK parses as JSON array)
  - `GET /v1/models` → `{ "data": [{ "id": "mock-model" }] }` (Anthropic/OpenAI models endpoint)
  - `GET /v1beta/models` → `{ "models": [{ "name": "models/gemini-pro", "supportedGenerationMethods": ["generateContent"] }] }`
  - Any other route → `404`
- [ ] Response delays: none (synchronous); no artificial delays needed
- [ ] Security: mock server binds to `127.0.0.1` only (loopback), not `0.0.0.0`

#### Phase 6: data-testid for chat messages (~5%)

**Files:**
- `src/AgentChatTab.ts`

**Tasks:**
- [ ] Add `data-testid="ai-agent-chat-message-user"` to user message elements
- [ ] Add `data-testid="ai-agent-chat-message-assistant"` to assistant message elements
- [ ] Add `data-testid="ai-agent-chat-input"` to the message input textarea
- [ ] Add `data-testid="ai-agent-chat-submit"` to the submit button
- [ ] Run `npm run build` to verify no TypeScript errors

#### Phase 7: Chat interaction E2E tests (~30%)

**Files:**
- `tests/e2e/chat-interaction.e2e.test.ts`

**Tasks:**
- [ ] Structure (per agent type — Anthropic, OpenAI, Gemini as sub-describes):
  ```typescript
  describe("chat-interaction: anthropic", () => {
    // beforeAll: start mockServer, launch Obsidian with API key + base URL env vars,
    //            navigate to settings, enable Claude in API mode, open sidebar
    // afterAll: quit, cleanup vault, close mock server

    it("sends a message and displays assistant response")
    it("displays error message when mock server is unavailable") // stop server first
  })
  ```
- [ ] Helper: `enableAgentInApiMode(page, agentId)` — navigates to settings, enables the specified agent in API mode, returns to main view
- [ ] Helper: `sendChatMessage(page, text)` — clicks the agent tab, types in input, submits
- [ ] Helper: `waitForAssistantMessage(page, expectedText)` — waits for `[data-testid="ai-agent-chat-message-assistant"]` to contain `expectedText`
- [ ] Test: send message → `waitForAssistantMessage(page, "Hello from mock")` passes
- [ ] Test (error path): stop mock server; send message; verify an error message appears in chat UI (look for error indicator element or text matching `/error|failed/i`)
- [ ] All test files guard with `if (!binary) ctx.skip()` in beforeAll
- [ ] Vault includes agent-specific plugin settings pre-populated (API mode enabled) via `vaultFactory` to avoid UI navigation brittleness — add optional `agentSettings?: Partial<PluginSettings>` parameter to `createTestVault`

### P1: Ship If Capacity Allows

- [ ] Test: `listModels()` endpoint stub — open settings in API mode → model dropdown shows `mock-model` (verifies model fetch hits mock server, not real API)
- [ ] `AgentApiRunner` debug log includes base URL (redact if it contains sensitive path components) — useful for diagnosing test failures

### Deferred

- File-op protocol in E2E (via mock server) — significant additional complexity; integration tests already cover this thoroughly
- Gemini streaming format support in mock server — non-streaming JSON array response is simpler and sufficient for verifying the provider path works
- Cross-platform E2E: Windows and Linux not tested in this sprint (macOS dev-only per Sprint 004)
- `openai-compat` E2E test — the provider already works with custom baseURL; testing it requires only adding a test case; deferred to keep scope tight

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/providers.ts` | Modify | Add `apiBaseUrlEnvVar` field to `ProviderConfig`; set values for Anthropic, OpenAI, Google |
| `src/providers/AnthropicProvider.ts` | Modify | Accept optional `baseURL` constructor param; validate and pass to SDK |
| `src/providers/OpenAIProvider.ts` | Modify | Accept optional `baseURL` constructor param; validate and pass to SDK |
| `src/providers/GeminiProvider.ts` | Modify | Accept optional `baseURL` constructor param; pass as `requestOptions.baseUrl` |
| `src/AgentApiRunner.ts` | Modify | Pass `baseURL` to all provider constructors in `createProvider()` |
| `src/runnerFactory.ts` | Modify | Read `apiBaseUrlEnvVar` from shellEnv; pass to `AgentApiRunner` |
| `src/AgentChatTab.ts` | Modify | Add `data-testid` attributes to chat messages, input, and submit button |
| `tests/e2e/helpers/electronHarness.ts` | Modify | Add `extraEnv` parameter to `launchObsidian` |
| `tests/e2e/helpers/mockApiServer.ts` | Create | In-process mock HTTP server (Anthropic, OpenAI, Gemini SSE/JSON formats) |
| `tests/e2e/helpers/vaultFactory.ts` | Modify | Add optional `agentSettings` parameter for pre-populating plugin settings |
| `tests/e2e/chat-interaction.e2e.test.ts` | Create | Chat interaction E2E tests using mock server and env injection |

## Definition of Done

- [ ] `npm run build` passes — no TypeScript errors
- [ ] `npm test` (unit tests) passes — no regressions
- [ ] `make test-integration` passes — no regressions
- [ ] `make test-e2e` passes on a machine with Obsidian installed; skips cleanly on a machine without Obsidian
- [ ] Env var absent → provider uses SDK default endpoint (verified by unit/integration test or code review)
- [ ] Env var set to valid URL → provider routes requests to that URL (verified by E2E mock test)
- [ ] Env var set to invalid value (not a URL, empty string) → provider silently uses SDK default (no crash)
- [ ] Anthropic E2E chat test: send message → assistant response appears in UI with mock text
- [ ] OpenAI E2E chat test: send message → assistant response appears in UI with mock text
- [ ] Gemini E2E chat test: send message → assistant response appears in UI with mock text
- [ ] Error path E2E test: mock server stopped → error message appears in chat UI
- [ ] Mock server binds to `127.0.0.1` (loopback only, not `0.0.0.0`)
- [ ] `electron.launch` `env` option merges `extraEnv` over `process.env` (not replace)
- [ ] Existing E2E tests (`plugin-load`, `sidebar-open`, `settings-ui`) still pass unaffected
- [ ] `data-testid` added to: chat message (user), chat message (assistant), input textarea, submit button
- [ ] Mock server `close()` called in `afterAll` in all test files that start one

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Anthropic/OpenAI SDK ignores `baseURL` for streaming path | Low | High | Test with a simple Node.js script before implementation; both SDKs document this option |
| Gemini SDK `requestOptions.baseUrl` path different from what SDK expects | Medium | Medium | Read SDK source to confirm parameter is passed to HTTP layer; fall back to non-streaming test if needed |
| Mock server SSE format not exactly matching SDK expectations | Medium | High | Capture real API responses with `DEBUG=true` and compare; test each format in isolation |
| Obsidian's Electron version affects `process.env` inheritance | Low | Medium | Playwright `electron.launch({ env })` sets process env for the child directly; this is well-supported |
| Settings not saved between Obsidian re-scans (detection shows key but enable toggle not saved) | Medium | Medium | Pre-populate settings in vault config file via `vaultFactory`; bypass UI navigation for settings setup |
| `electronHarness` env merge changes break existing E2E tests | Low | Low | `extraEnv` is optional with `undefined` default; existing callers unchanged |

## Security Considerations

- **Mock server loopback-only**: Server binds `127.0.0.1`; no external exposure even during tests
- **Fake API keys**: The env vars injected in tests contain placeholder strings, not real credentials; they are never committed to git
- **URL validation**: Provider constructors validate `baseURL` starts with `http://` or `https://`; malformed values are silently dropped (use SDK default)
- **Env merge order**: `{ ...process.env, ...extraEnv }` means test env vars override parent env; this is intentional but means test env vars cannot accidentally expose real production keys if both are set (test vars win)
- **No new production attack surface**: The `apiBaseUrlEnvVar` override is read from the shell environment, which is already under user control (same trust level as `apiKeyEnvVar`)

## Observability & Rollback

- **Post-ship verification**: Run `make test-e2e`; new tests pass if mock server is wired correctly; existing tests still pass confirming no regression
- **Correctness proof**: E2E test produces a chat response that exactly matches the mock server's canned string — no ambiguity about whether the real API was called
- **Rollback**: All production changes are additive (new optional constructor params, new env var reads with fallback). Reverting `src/runnerFactory.ts` to remove the `baseURL` read line is the only rollback action needed; provider constructors still work without the optional param.

## Documentation

- [ ] Update `tests/e2e/README.md` to document: mock server helper, env var override pattern, how to run chat interaction tests
- [ ] Add inline JSDoc to `apiBaseUrlEnvVar` field in `ProviderConfig` explaining its purpose and test use case

## Dependencies

- Sprint 004 complete — `vaultFactory`, `electronHarness`, `obsidianBinary` helpers exist
- No new npm packages
- Node.js `http` module (built-in)
- Obsidian desktop app installed on test machine (skip gracefully if absent)

## Open Questions

1. Does the Google Generative AI SDK's `requestOptions.baseUrl` apply to the streaming `sendMessageStream` call, or only to `generateContent`? (Research needed; confirmed `requestOptions` exists in type definitions but streaming path needs verification)
2. Should `vaultFactory.createTestVault` accept `PluginSettings` override inline, or should the chat test write `data.json` directly to the plugin dir? (Direct file write is simpler; `vaultFactory` modification avoids hardcoding file structure in test)
