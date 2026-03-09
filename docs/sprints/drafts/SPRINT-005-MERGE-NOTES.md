# Sprint 005 Merge Notes

## Claude Draft Strengths
- Precise mock server SSE format specification per provider (Anthropic, OpenAI, Gemini)
- Explicit harness fix proposal (direct binary spawn without positional args)
- Detailed data-testid placement for streaming vs. static chat elements
- URL validation approach with fallback behavior

## Claude Draft Weaknesses (from Codex critique)
- `electron.launch({ env })` reference was wrong — current harness uses `open -a` + CDP
- Architecture diagram incorrectly showed `openai-compat` receiving env-var base URL
- Gemini marked as DoD-required despite interview deciding P1

## Codex Draft Strengths
- Correctly identified harness architecture mismatch (critical)
- Added integration test phase for URL override validation (good catch)
- Mock server request capture assertion ("verify server received exactly one request")
- Clean openai-compat scope exclusion

## Codex Draft Weaknesses (from Claude critique)
- Harness fix identified but no replacement proposed
- No data-testid specification for streaming chat elements
- `resolveShellEnv` module cache interaction with integration tests underspecified
- Mock server SSE format left as "mirror exactly" without specifying exact shapes
- No vaultFactory data.json seeding detail

## Valid Critiques Accepted
- **Harness fix**: Use direct binary spawn (`spawn(binaryPath, ['--remote-debugging-port=PORT'], { env: {...} })`) instead of `open -a`. Vault is already registered in obsidian.json, so no positional vault arg is needed. No CLI mode triggered. Env injection works cleanly.
- **Integration tests**: Add URL validation tests in `runner-factory.integration.test.ts` (valid URL picked up, malformed ignored, empty treated as absent). Note: tests that need fresh `resolveShellEnv` must clear the module cache via `vi.resetModules()` or stub the module.
- **openai-compat from diagram**: Remove from env var threading diagram; openai-compat keeps settings-based URL (no change).
- **Mock server request capture**: Add `requestCount(path)` accessor to `MockServer` interface.
- **Gemini P1**: Per interview; Gemini E2E is best-effort.
- **Single canonical setup strategy**: Use pre-seeded `data.json` (via vaultFactory `agentSettings` param). No UI navigation for agent enablement in chat tests.
- **URL validation centralization**: Primary validation in `runnerFactory`; provider constructors do light validation as defense-in-depth only.

## Critiques Rejected (with reasoning)
- **Remove defense-in-depth URL validation from providers**: Providers are also constructed directly in integration tests; having a quick validation guard there prevents subtle test misconfigurations. Low cost, reasonable benefit.

## Interview Refinements Applied
- Gemini E2E → P1 (best effort)
- Pre-populate settings via data.json (not UI navigation)

## Final Decisions
1. Harness: spawn binary directly with `env` option; keep vault registration approach
2. E2E chat tests: Anthropic + OpenAI P0; Gemini P1
3. Mock server: Node `http`, loopback only, request capture, configurable response
4. VaultFactory: add `agentSettings?: Partial<PluginSettings>` for data.json override
5. Integration tests: add URL validation tests in runner-factory suite
6. data-testid: on both streaming container (created by `createStreamingMessage`) and historical messages

## Sprint Sizing Gate
- P0 tasks: ~7 files modified/created, focused scope
- Fits comfortably in a single sprint
- No split needed
