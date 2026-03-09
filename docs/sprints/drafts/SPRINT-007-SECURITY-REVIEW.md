# Sprint 007 Security Review

## Attack Surface Analysis

### New inputs and trust boundaries introduced

1. **`GeminiProvider(apiKey, baseURL?)`** — adds one new optional parameter. `baseURL` flows from `runnerFactory.ts` which already validates it with `isValidBaseUrl()` (accepts only `http://` or `https://` URLs). No new trust boundary; the validation path already exists for Anthropic and OpenAI providers. Rating: **Low** — identical to existing providers.

2. **Exported functions** (`buildSystemPrompt`, `filterOpenAIModelId`, `mergeGeminiMessages`) — adding `export` makes these functions importable by test code. They are pure functions with no side effects, no network calls, and no file I/O. They were callable at runtime before (as module-level functions); export doesn't change this. Rating: **Low** — no runtime behavior change.

3. **`writeStderrScript`, `writeExitCodeScript`, `writeArgCaptureScript`** in `fakeAgent.ts` — write `.mjs` scripts to `os.tmpdir()`. Content is embedded via `JSON.stringify()` (existing pattern from `writeFakeScript`), which escapes all special characters. Scripts are only invoked in test environments, never in production code. Rating: **Low** — same pattern as existing helpers; no new attack surface.

4. **Gemini mock routes in `mockApiServer.ts`** — adds new HTTP routes handling `POST /v1beta/models/*:streamGenerateContent` and `GET /v1beta/models`. Server binds to `127.0.0.1` loopback only. New routes accept POST bodies but immediately resume/discard them (same pattern as existing routes). Rating: **Low** — loopback-only, test-environment-only.

## Data Handling

- **API keys in test environment**: All test API keys are strings like `"fake-gemini-key"` — never real keys. These follow the established pattern from Sprints 004–005.
- **`vault.read` content in tests**: The context payload tests use synthetic data (`"# Active Note\nSome content here"`, `"x".repeat(20_000)`). No real vault content is handled.
- **GeminiProvider `baseURL`**: Validated in `runnerFactory.ts` before reaching the provider; same validation as Anthropic/OpenAI. If invalid, `baseURL` is `undefined` (SDK uses hardcoded default).

Rating: **Low** — no new sensitive data handling.

## Injection and Parsing Risks

- **`mergeGeminiMessages` extraction**: This is a pure transformation on `ChatMessage[]`. No parsing of external input; input originates from the in-process chat history. Rating: **Low**.
- **`filterOpenAIModelId`**: Regex `/^o\d/` plus string prefix check — no user input evaluated, no eval-adjacent code. Rating: **Low**.
- **Gemini mock server route dispatch**: Uses `url.startsWith("/v1beta/")` for routing. No template parsing or dynamic code execution. Rating: **Low**.
- **`writeArgCaptureScript`**: Writes `JSON.stringify(process.argv.slice(2))` to stdout — reads from process.argv, not from user input. Script content is statically generated (no dynamic concatenation). Rating: **Low**.

## Authentication / Authorization

No auth flows or permission checks are touched by this sprint. Provider API keys flow through existing validated paths.

## Dependency Risks

No new npm packages. All changes use existing dependencies (Vitest, Node.js `http`, Google AI SDK, Anthropic SDK, OpenAI SDK).

## Threat Model

**Project context**: This is an Obsidian desktop plugin used locally by individual developers. There is no multi-tenant deployment, no web server exposure, and no untrusted user input beyond the chat message input (handled by existing sanitization).

**Realistic adversarial scenario for Sprint 007 changes**:
- Most realistic: a malicious model response containing `:::file-op` blocks. This is already tested in integration tests and handled by the parser. No new parsing code is added in this sprint.
- The `GeminiProvider baseURL` addition uses the same `isValidBaseUrl` guard already in place for Anthropic/OpenAI. A malicious env var or settings value would need to bypass `isValidBaseUrl()` — which it cannot (only `http://` and `https://` are accepted). The SDK then handles the actual connection.

## Findings Summary

| Finding | Rating | Mitigation |
|---------|--------|-----------|
| `GeminiProvider` accepts `baseURL` — same as existing providers | Low | Already validated by `isValidBaseUrl()` in runnerFactory; no DoD change needed |
| New exported pure functions — no side effects | Low | No DoD change needed |
| New fake agent scripts write to tmpdir | Low | `JSON.stringify` embedding prevents injection; test-only |
| Gemini mock server routes — loopback only | Low | `127.0.0.1` binding; test-only |

**No Critical or High findings.** No DoD modifications required from the security review.

## Conclusion

Sprint 007 is a test-addition sprint with one small production change (GeminiProvider `baseURL` parameter). All production changes are strictly additive and follow established patterns. No new attack surface, no sensitive data handling changes, no new dependencies. The sprint is safe to proceed.
