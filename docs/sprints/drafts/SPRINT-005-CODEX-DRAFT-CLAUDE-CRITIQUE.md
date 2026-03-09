# Sprint 005 Codex Draft Critique (by Claude)

## What Codex Got Right

- **Harness architecture bug**: Correctly identified that `electron.launch({ env })` doesn't exist in the current harness (which uses `open -a` + CDP). This is the most actionable finding in the critique.
- **Integration tests for URL override**: Adding `runner-factory.integration.test.ts` tests for valid/malformed/empty URL env vars is a genuine gap in the Claude draft. These run without Obsidian and give fast, deterministic coverage.
- **"Verify mock server received request"**: Adding request capture to the mock server (assert the server actually received one request) is a stronger correctness guarantee than just checking the UI.
- **Clean scope boundary**: Explicitly keeping openai-compat settings-based and excluding it from the new env var path avoids a real confusing overlap.
- **`openai-compat` flow correction**: Correctly called out that the architecture diagram was wrong — `AgentApiRunner` can't access `config.baseUrl`; that lives in `runnerFactory`.

## Weaknesses in the Codex Draft

1. **Harness fix is undefined**: Codex identifies the `electron.launch` mistake but provides zero replacement proposal. It says "rewrite to target existing CDP harness path" without specifying what that looks like. The correct fix is to refactor `launchObsidianMacOS` to spawn the Obsidian binary directly (without vault path positional args, which trigger CLI mode) so we can pass `env` via Node's `spawn` `env` option. Registering the vault in `obsidian.json` first (already done) means Obsidian will open the right vault without a positional arg. This needs to be in the merged plan.

2. **No data-testid specification for chat UI**: Codex says "add chat UI selectors for stable interaction" but doesn't specify WHERE in `AgentChatTab.ts` they should be placed. The Claude draft correctly called out that the streaming path (via `createStreamingMessage()`) creates elements dynamically — test IDs must be on elements that exist both during streaming and after completion. This detail is critical for E2E reliability.

3. **Integration test setup is underspecified**: `resolveShellEnv()` uses a module-level promise cache. Tests that set env vars must either: (a) reset the module between tests via `vi.resetModules()`, or (b) call `resolveShellEnv` fresh each invocation. This needs to be addressed in the integration test design — the Codex draft notes it but gives no solution ("set env vars before first call" is not sufficient if the cache persists).

4. **Mock server format remains "verify exactly" but unspecified**: Codex says "mirror SDK-expected event shapes exactly and assert with minimal deterministic payloads" without specifying what those shapes are. This leaves a high-risk gap: if the mock SSE format is even slightly wrong, the streaming tests silently produce no tokens (no error, just empty response), which is the worst kind of test failure. The mock format must be spec'd precisely in the plan.

5. **Gemini handled inconsistently**: Codex says "include Gemini only if SDK override is confirmed workable" but the `@google/generative-ai` SDK's `RequestOptions.baseUrl` field is visible in the type definitions — it's supported. Leaving this as a gate rather than just flagging it as P1 creates unnecessary ambiguity in the plan.

6. **No vaultFactory settings seeding detail**: The Claude draft proposed writing `data.json` directly to pre-configure API mode. Codex agrees with this approach in the critique but its own draft doesn't specify how the vault factory should write this file — what structure, what fields, what defaults. Without this, test setup will be written ad hoc in each test file.

## Decisions I Defend From My Original Draft

- **Precise mock server SSE format specification**: The detailed Anthropic/OpenAI/Gemini event shapes in the Claude draft are necessary, not over-specified. Without them, the mock server implementation is guesswork.
- **data-testid additions to `AgentChatTab.ts`**: Required for reliable E2E chat interaction; the Codex draft agrees (it adds "add chat UI selectors") but doesn't include a file to modify.
- **URL validation in provider constructors is redundant but harmless**: Codex says validate only in `runnerFactory`. That's correct for the primary flow. But a defense-in-depth validation in the provider constructor (since providers are also constructed in integration tests directly) is worth keeping.

## Summary

Codex's strongest contribution is the harness architecture finding and the integration test gap. The Claude draft is stronger on implementation specifics (mock server format, data-testid placement, harness fix proposal). The merge should: adopt Codex's integration test phase, incorporate the harness spawn fix (proposing direct binary spawn as the solution), keep Claude's mock server format specification, and include vaultFactory data.json seeding details.
