# Sprint 005 Intent: API Endpoint Env Var Overrides + Chat E2E Tests

## Seed

Let's setup some env vars for each agent that can be read in to set their url endpoints for their APIs so that we can setup mock testing endpoints and test the plugin more thoroughly in our e2e tests without using real API keys and wasting tokens to test basic functionality. The new e2e tests should be able to use the endpoints from the env vars and fake api key env vars to test out the chat interface for each enabled agent.

## Context

The plugin currently has 5 provider implementations (Anthropic, OpenAI, Gemini, OpenAI-compat, GitHub Copilot). Every API provider hardcodes its SDK endpoint (Anthropic SDK → `api.anthropic.com`, OpenAI SDK → `api.openai.com`, Google SDK → `generativelanguage.googleapis.com`). The `OpenAICompatProvider` is the single exception — it already accepts a caller-supplied `baseURL`.

Sprint 004 added Playwright/Electron E2E tests that verify UI surfaces (plugin loads, sidebar opens, settings renders). Chat interaction was explicitly deferred because it requires real CLI agents or API keys and introduces flakiness. This sprint removes that blocker by introducing per-provider URL override env vars, allowing E2E tests to point the SDKs at a local mock HTTP server.

## Recent Sprint Context

- **SPRINT-002**: Provider-centric settings, CLI/API modes, API key detection from shell env — established the OBSIDIAN_AI_AGENT_SIDEBAR_ namespace for all env vars
- **SPRINT-003**: Full integration test suite — mock provider adapter pattern in `AgentApiRunner`, `ObsidianStub`, `MockVault`; integration tests already cover streaming/file-op parsing thoroughly
- **SPRINT-004**: Playwright/Electron E2E suite — `vaultFactory`, `electronHarness` (with env injection via `electron.launch`), `obsidianBinary` finder; deferred chat interaction explicitly

## Relevant Codebase Areas

| File | Relevance |
|------|-----------|
| `src/providers/AnthropicProvider.ts` | Uses `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })` — no baseURL |
| `src/providers/OpenAIProvider.ts` | Uses `new OpenAI({ apiKey, dangerouslyAllowBrowser: true })` — no baseURL |
| `src/providers/GeminiProvider.ts` | Uses `new GoogleGenerativeAI(apiKey)` — no baseURL; SDK may support `requestOptions.baseUrl` |
| `src/providers/OpenAICompatProvider.ts` | Already accepts `baseURL` constructor param — template for others |
| `src/AgentApiRunner.ts` | Calls `createProvider()`; passes `baseURL` only for `openai-compat` |
| `src/runnerFactory.ts` | Reads `agentConfig.openaiCompatBaseUrl` from settings; no env var URL override |
| `src/providers.ts` | `ProviderConfig` has `apiKeyEnvVar` — needs parallel `apiBaseUrlEnvVar` field |
| `src/shellEnv.ts` | Module-level cache for resolved shell env; both runners already use this |
| `tests/e2e/helpers/electronHarness.ts` | `electron.launch({ executablePath, args })` — needs `env` option added |
| `tests/e2e/helpers/vaultFactory.ts` | Creates temp vault with plugin installed |

## Constraints

- Must follow the `OBSIDIAN_AI_AGENT_SIDEBAR_` env var namespace established in SPRINT-002
- Must not break existing callers — URL override is opt-in (env var absent = use SDK default)
- Env vars read at provider construction time (not settings-persisted) — same pattern as API keys
- Playwright `electron.launch` accepts an `env` option: the harness must merge test-specific env vars with the parent process env
- No new npm dependencies — use Node.js built-in `http` for the mock server
- All SDK clients that accept `baseURL`/`baseUrl` must validate the value is a well-formed `http://` or `https://` URL before passing it in

## Success Criteria

1. Each API provider reads a provider-specific `OBSIDIAN_AI_AGENT_SIDEBAR_<PROVIDER>_BASE_URL` env var and routes SDK calls to that URL when set
2. E2E tests can launch Obsidian with mock server env vars injected, enable an agent, send a chat message, and verify the response appears in the UI
3. When env vars are absent, provider behavior is identical to today (no regression)
4. `npm run build`, `npm test`, and `make test-integration` all pass after the sprint

## Verification Strategy

- Reference: OpenAI and Anthropic SDKs document `baseURL` as a supported constructor option
- Conformance: mock server must respond in the exact SSE format each SDK expects
- Edge cases: malformed URL in env var (reject / fall back to default); empty string env var (treat as absent)
- Testing: E2E chat tests send a message → receive a streamed token response → verify text appears in UI

## Uncertainty Assessment

- **Correctness uncertainty**: Medium — Anthropic/OpenAI SDK `baseURL` override is documented and straightforward; Gemini SDK `baseUrl` option is less clearly documented; mock server SSE format must exactly match SDK expectations
- **Scope uncertainty**: Low — env var wiring + mock server + 1-2 new E2E test files is bounded
- **Architecture uncertainty**: Low — follows established patterns in the codebase

## Approaches Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A: Env var base URL per provider** (read at construction; provider reads env var via injected env or `process.env`) | Consistent with existing API key env var pattern; no settings changes; Playwright can inject via `electron.launch({ env })`; backwards compatible | Requires env var to propagate through shellEnv or direct `process.env` read; timing dependency (env var must be set before provider construction) | **Selected** — cleanest; matches existing OBSIDIAN_AI_AGENT_SIDEBAR_ pattern; Playwright `env` injection solves propagation |
| **B: Settings-persisted base URL per provider** (new AgentConfig field like openai-compat) | Easy to set via UI | Persisted to disk; wrong abstraction (endpoint is test infrastructure, not user preference); requires UI changes | Rejected — test config doesn't belong in user settings |
| **C: Use openai-compat for all testing** (don't modify other providers) | Zero production code changes | Only tests one provider path; Anthropic and Gemini providers remain untested end-to-end; doesn't solve the stated goal | Rejected — doesn't meet stated goal of testing each agent |

## Open Questions

1. Does the `@google/generative-ai` SDK support a `baseUrl` override in `GoogleGenerativeAI` constructor options? If not, can we wrap the HTTP calls for `listModels()` to use the override, while accepting that streaming tests for Gemini are out of scope for this sprint?
2. Should the mock server be a shared long-lived process per test file (started in `beforeAll`) or per-test (started/stopped per `it` block)? Per-file is simpler and sufficient.
3. Should we test all 3 providers (Anthropic, OpenAI, Gemini) in E2E or focus on Anthropic + OpenAI (which share the same SSE override pattern) and defer Gemini to a follow-up?
