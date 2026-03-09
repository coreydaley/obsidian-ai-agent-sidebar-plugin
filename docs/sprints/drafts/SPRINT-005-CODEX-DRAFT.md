# Sprint 005 Draft (Codex): API Endpoint Env Overrides + Chat E2E

## Sprint Goal
Add provider-specific API base URL environment-variable overrides and use them in new E2E chat tests with a local mock HTTP server, so chat streaming can be validated end-to-end without real API keys or paid tokens.

## Scope

### In Scope
- Add `OBSIDIAN_AI_AGENT_SIDEBAR_*_BASE_URL` env vars for API providers.
- Validate base URL env vars before wiring into SDK clients.
- Keep overrides opt-in: unset/empty/malformed values fall back to existing defaults.
- Thread base URL resolution through runtime env detection/factory path (same style as API key resolution).
- Extend E2E harness launch API to accept and inject test env vars (merged with parent env).
- Add local Node `http` mock server helpers for Anthropic/OpenAI (and Gemini if SDK override is confirmed).
- Add E2E tests that:
  - enable an API-mode agent in the temp vault
  - send a chat message
  - verify streamed assistant text appears in the sidebar
  - verify the mock endpoint actually received the request
- Preserve existing unit/integration/E2E suites.

### Out of Scope
- Persisting provider base URLs in plugin settings UI.
- Replacing existing OpenAI-compatible settings-based base URL behavior.
- Broad E2E redesign outside env injection and chat coverage needed for this sprint.
- Real-provider network calls in E2E.

## Current-State Baseline
- Provider constructors:
  - `AnthropicProvider` and `OpenAIProvider` do not accept base URL.
  - `GeminiProvider` does not currently expose base URL control in code.
  - `OpenAICompatProvider` already accepts `baseURL`.
- `runnerFactory.ts` resolves API keys from shell env (`resolveShellEnv`) and creates `AgentApiRunner` without provider-specific base URL overrides.
- `AgentApiRunner.createProvider()` only passes `baseURL` to `OpenAICompatProvider`.
- E2E suite currently validates load/sidebar/settings only; chat flow is not covered.
- E2E harness currently launches Obsidian but has no explicit test-env injection API for provider endpoint overrides.

## Env Var Contract

Use plugin namespace consistently:

- Anthropic: `OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL`
- OpenAI: `OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_BASE_URL`
- Gemini: `OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_BASE_URL`
- OpenAI-compatible remains settings-driven; no new env var required for this sprint

Validation rules:
- Trim whitespace.
- Empty string => treat as absent.
- Must parse as URL and use `http:` or `https:` protocol.
- On invalid value: ignore override, log debug warning, use provider default endpoint.

## Design Decisions
1. Resolve base URL env vars in `runnerFactory` from `resolveShellEnv()` and pass into `AgentApiRunner` explicitly.
- Rationale: keeps all API runtime env resolution in one place and avoids providers reading raw `process.env` directly.

2. Extend `AgentApiRunner` constructor to accept optional provider base URL override by agent.
- Rationale: minimal API change, keeps provider selection centralized.

3. Keep malformed base URL behavior non-fatal (fallback, not error runner).
- Rationale: satisfies non-breaking requirement and avoids accidental user lockout.

4. Prefer Anthropic + OpenAI E2E chat first; include Gemini only if SDK-level base URL override is confirmed workable in this codebase.
- Rationale: ensures sprint lands deterministic coverage without blocking on uncertain Gemini SDK behavior.

## Implementation Plan

### Phase 1: Provider Metadata + URL Validation Plumbing

**Files**
- `src/providers.ts`
- `src/runnerFactory.ts`
- `src/AgentApiRunner.ts`
- `src/types.ts` (if needed for a typed override map)

**Tasks**
- [ ] Add optional `apiBaseUrlEnvVar?: string` to `ProviderConfig`.
- [ ] Populate `apiBaseUrlEnvVar` for `anthropic`, `openai`, `google`.
- [ ] In `runnerFactory` API branch:
  - resolve base URL env var from `resolveShellEnv()`
  - validate via shared helper (`http/https` only)
  - pass valid override into `AgentApiRunner`
- [ ] Expand `AgentApiRunner.createProvider()` signatures so:
  - `AnthropicProvider` can receive optional `baseURL`
  - `OpenAIProvider` can receive optional `baseURL`
  - `GeminiProvider` can receive optional `baseURL` if supported
- [ ] Keep `openai-compat` path unchanged (settings-provided URL still required).

### Phase 2: Provider Constructor Updates

**Files**
- `src/providers/AnthropicProvider.ts`
- `src/providers/OpenAIProvider.ts`
- `src/providers/GeminiProvider.ts` (conditional on SDK support confirmation)

**Tasks**
- [ ] `AnthropicProvider(apiKey, baseURL?)` passes `baseURL` to SDK client options when provided.
- [ ] `OpenAIProvider(apiKey, baseURL?)` passes `baseURL` to SDK client options when provided.
- [ ] Confirm Gemini SDK override path:
  - if constructor/request options support `baseUrl`, implement it
  - if unsupported, document limitation and leave Gemini on default endpoint this sprint.
- [ ] Ensure model listing calls follow the same override route (not just streaming) where possible.

### Phase 3: Integration Coverage for Override Resolution

**Files**
- `tests/integration/runner-factory.integration.test.ts`
- `tests/integration/agent-api-runner.integration.test.ts` (as needed)

**Tasks**
- [ ] Add tests that verify valid base URL env var is picked up for Anthropic/OpenAI API mode.
- [ ] Add test that malformed base URL does not error and falls back to default behavior.
- [ ] Add test that empty base URL env var is treated as absent.
- [ ] Keep tests deterministic by setting env vars before first `resolveShellEnv()` call in file process.

### Phase 4: E2E Harness Env Injection

**Files**
- `tests/e2e/helpers/electronHarness.ts`
- `tests/e2e/helpers/vaultFactory.ts` (if provider-specific startup settings are needed)

**Tasks**
- [ ] Extend `launchObsidian(...)` options with `env?: Record<string, string>`.
- [ ] Merge env as `{ ...process.env, ...options.env }` when launching Obsidian.
- [ ] Keep existing launch/cleanup guarantees and skip behavior.
- [ ] Ensure each chat E2E test can isolate env overrides without leaking to other tests.

### Phase 5: Mock API Server Helpers

**Files**
- `tests/e2e/helpers/mockApiServer.ts` (new)

**Tasks**
- [ ] Build Node `http` server helper with per-provider routes and request capture.
- [ ] Implement streaming responses in SDK-compatible SSE/event format:
  - Anthropic messages stream events ending with stop event.
  - OpenAI chat completions stream `data:` chunks ending with `[DONE]`.
  - Gemini format only if override path is implemented.
- [ ] Expose start/stop API and captured request assertions (method/path/body count).

### Phase 6: Chat E2E Tests

**Files**
- `tests/e2e/chat-api-mock.e2e.test.ts` (new)
- `tests/e2e/helpers/selectors.ts`

**Tasks**
- [ ] Add chat UI selectors for stable interaction:
  - active chat textarea
  - send button
  - assistant message content container
- [ ] For each covered provider (minimum Anthropic + OpenAI):
  - create vault with provider enabled in API mode
  - launch Obsidian with fake API key + provider base URL env vars
  - open sidebar and provider tab
  - send message (`hello from e2e`)
  - assert streamed mock response appears in assistant message
  - assert mock server observed exactly one provider request
- [ ] Capture screenshots on failure in existing artifacts directory.

### Phase 7: Docs + Validation

**Files**
- `README.md` (API key/env section)
- `tests/e2e/README.md`

**Tasks**
- [ ] Document new base URL env vars as test/mocking overrides.
- [ ] Clarify that overrides are optional and intended for testing/local proxies.
- [ ] Run full checks:
  - `npm run build`
  - `npm test`
  - `make test-integration`
  - `make test-e2e` (when Obsidian is installed)

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/providers.ts` | Modify | Add provider-level base URL env var metadata |
| `src/runnerFactory.ts` | Modify | Resolve/validate env URL overrides and pass to API runner |
| `src/AgentApiRunner.ts` | Modify | Thread per-agent base URL override into provider creation |
| `src/providers/AnthropicProvider.ts` | Modify | Support optional SDK `baseURL` |
| `src/providers/OpenAIProvider.ts` | Modify | Support optional SDK `baseURL` |
| `src/providers/GeminiProvider.ts` | Modify (conditional) | Support optional base URL if SDK allows |
| `tests/integration/runner-factory.integration.test.ts` | Modify | Validate env override and fallback behavior |
| `tests/e2e/helpers/electronHarness.ts` | Modify | Add merged env injection for Obsidian launch |
| `tests/e2e/helpers/mockApiServer.ts` | Create | Local mock streaming provider endpoints |
| `tests/e2e/helpers/selectors.ts` | Modify | Add chat input/output selectors |
| `tests/e2e/chat-api-mock.e2e.test.ts` | Create | End-to-end mocked chat coverage |
| `README.md` | Modify | Document base URL override env vars |
| `tests/e2e/README.md` | Modify | Document mocked-chat E2E workflow |

## Acceptance Criteria
1. Anthropic and OpenAI providers honor `OBSIDIAN_AI_AGENT_SIDEBAR_*_BASE_URL` when valid.
2. Empty or malformed URL env vars do not break chat; provider defaults still work.
3. E2E chat test(s) run against local mock server with fake API keys and assert streamed UI output.
4. Existing E2E load/sidebar/settings tests remain green or unchanged in behavior.
5. `npm run build`, `npm test`, and `make test-integration` pass.

## Risks and Mitigations
1. Gemini base URL override may not be supported by current SDK surface.
- Mitigation: ship Anthropic/OpenAI coverage in Sprint 005; track Gemini separately if blocked.

2. Mock SSE framing mismatch can cause flaky/non-starting streams.
- Mitigation: mirror SDK-expected event shapes exactly and assert with minimal deterministic payloads.

3. Obsidian/Electron launch behavior may vary by platform.
- Mitigation: keep existing skip/failure semantics; isolate new chat tests behind the same harness reliability checks.

## Open Questions
1. Confirm exact supported Gemini base URL override API in `@google/generative-ai` version pinned by this repo.
2. Should Sprint 005 include a light harness refactor to avoid any mutation of user-global Obsidian config during E2E runs, or keep that as follow-up hardening?
