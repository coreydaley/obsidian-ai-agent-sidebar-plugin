# Sprint 007 Intent: Comprehensive Test Gap-Filling

## Seed

Identify any gaps in our unit, integration, and e2e testing and fill them. We want as comprehensive coverage as possible without having to do anything abnormal or crazy to accomplish it.

## Context

Six sprints have delivered a feature-complete Obsidian plugin with three test layers:
- **Unit** (`src/__tests__/` via `npm test`, `tests/unit/` via `npm run test-unit`): covers `sanitiseError`, `buildSystemPrompt` (AgentRunner), `MODEL_FORMAT`, `SHELL_INJECTION_PATTERN`, AgentDetector cache, and full AgentChatTab event/lifecycle coverage.
- **Integration** (`tests/integration/`): covers AgentRunner file-op protocol parsing, AgentApiRunner streaming + file-op (read only) + inactivity timeout + dispose, FileOperationsHandler CRUD + path traversal, AgentDetector binary/API-key detection + caching, shell-env contract, and runnerFactory CLI/API mode-switching + base URL env var.
- **E2E** (`tests/e2e/`): covers plugin load, sidebar open, settings UI, tab visibility, settings mode toggle, and chat interaction (Anthropic + OpenAI API mode via mock server).

No sprints are currently in-progress. The repository is clean.

## Recent Sprint Context

- **Sprint 004**: E2E infrastructure — Playwright Electron harness, vault factory, mock API server skeleton, chat data-testid attributes, plugin-load / sidebar-open / settings-ui tests.
- **Sprint 005**: API base URL env var overrides + chat E2E interaction tests (Anthropic + OpenAI mock server). Gemini E2E was P1/deferred.
- **Sprint 006**: AgentChatTab JSDOM unit tests (render, send flow, streaming events, fileOps, lifecycle). Mode-switching integration tests. P1 items (clearHistory, context payload, Enter-key) explicitly deferred.

## Relevant Codebase Areas

| File | Gap |
|------|-----|
| `src/providers/AnthropicProvider.ts` | `buildSystemPrompt` unexported + untested |
| `src/providers/OpenAIProvider.ts` | `buildSystemPrompt` unexported + untested; `listModels()` filter logic untested |
| `src/providers/GeminiProvider.ts` | `buildSystemPrompt` unexported + untested; message-merging/alternating logic unexported + untested |
| `src/providers/OpenAICompatProvider.ts` | `buildSystemPrompt` unexported + untested; empty-apiKey→"ollama" path untested |
| `src/AgentChatTab.ts` | clearHistory, context payload (vaultPath + active file + truncation), Enter-key send — deferred from Sprint 006 |
| `src/runnerFactory.ts` | settings-level `apiBaseUrl` override path (settingsBaseUrl || rawEnvBaseUrl) not tested in integration |
| `tests/integration/agent-runner.integration.test.ts` | No tests for stderr events, non-zero exit, extraArgs/yoloArgs passthrough |
| `tests/integration/agent-api-runner.integration.test.ts` | File-op variants write/delete/rename/list not tested — only `read` |
| `tests/e2e/chat-interaction.e2e.test.ts` | Gemini chat interaction (P1 from Sprint 005) |

## Constraints

- Must follow project conventions in CLAUDE.md
- No new npm packages (all gaps can be addressed with existing test tooling)
- Exporting private functions from providers is acceptable (small refactor, no behavior change)
- E2E tests must gracefully skip if Obsidian binary is not present
- Integration tests must not depend on real API keys or network calls
- No modification to production behavior — test-only additions with minor exports

## Success Criteria

- Every source file's observable logic has at least one test covering it
- The four provider `buildSystemPrompt` functions are tested
- GeminiProvider message-merging and last-message validation logic is tested
- OpenAIProvider model-ID filtering (`gpt-` / `o\d`) is tested
- AgentChatTab clearHistory, context payload, and Enter-key are tested
- AgentRunner stderr + non-zero exit + extraArgs/yoloArgs are tested
- AgentApiRunner write/delete/rename/list file-op variants are tested
- runnerFactory settings-level `apiBaseUrl` override path is tested
- Gemini E2E chat interaction is covered (or explicitly documented as infeasible)

## Verification Strategy

- All existing tests (`npm test`, `npm run test-unit`, `make test-integration`, `make test-e2e`) continue to pass
- New unit tests run under existing `npm run test-unit` or `npm test` (same Vitest configs)
- New integration tests run under `make test-integration` (same config, same fakeAgent infrastructure)
- E2E Gemini test follows exact same pattern as Anthropic/OpenAI tests already in `chat-interaction.e2e.test.ts`

## Uncertainty Assessment

- **Correctness uncertainty**: Low — filling gaps with well-understood pure functions and existing patterns
- **Scope uncertainty**: Low — gaps are clearly enumerable from reading source + tests
- **Architecture uncertainty**: Low — no new infrastructure needed; all patterns established in prior sprints

## Approaches Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A: Export private functions + fill gaps at all layers** | Clean, fast tests; follows established patterns; no mocking complexity | Requires minor export additions to 4 provider files | **Selected** — minimal invasiveness, maximum coverage value |
| B: Test providers only through integration tests (no exports) | No source changes needed | Requires mocking provider SDKs (complex); slower; integration tests already cover the API streaming path | Rejected — over-engineered for pure function testing |
| C: Focus only on unit gaps, skip integration gaps | Faster sprint | Leaves meaningful integration gaps (file-op variants, stderr, exitCode) | Rejected — leaves known gaps unfilled |

## Open Questions

1. Can the Gemini E2E test use the same `chat-interaction.e2e.test.ts` pattern with the existing `mockApiServer` extended for Gemini's SSE format? *(Expectation: yes, following Sprint 005 P1 plan)*
2. For provider `buildSystemPrompt`, should we export it with a named export or extract it to a shared utility? *(Expectation: named export per-file is simplest)*
