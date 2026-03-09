# Sprint 007 Claude Draft Critique (by Codex)

## Summary
Claude’s draft is thorough and mostly aligned with the intent, but it has one major scope violation and several test-design gaps that would either introduce production behavior changes or leave key acceptance criteria weakly proven.

## What Claude Draft Gets Right
- Correctly identifies the main untested areas: provider prompt helpers, deferred `AgentChatTab` cases, runner edge paths, and missing file-op op variants.
- Proposes low-friction test-first work for most gaps using existing fixtures/harnesses.
- Keeps the sprint focused on coverage expansion rather than feature work.

## Critical Issues

1. Gemini plan violates stated sprint constraints.
- Draft Phase 7a adds production behavior (`GeminiProvider(apiKey, baseURL?)` and `AgentApiRunner` provider wiring changes).
- Intent explicitly constrains Sprint 007 to test additions with only minor export/testability refactors.
- Recommendation: keep Gemini E2E as “implement if feasible with existing behavior, otherwise document infeasible/defer,” and do not require production transport changes in this sprint.

2. `runnerFactory` base URL precedence tests are not strong enough to prove precedence.
- Multiple proposed tests only assert “returns `AgentApiRunner` / no error,” which can pass whether settings or env won.
- Recommendation: add an observable assertion that distinguishes selected base URL (constructor-arg capture/mocking or behavioral probe with divergent values), otherwise precedence is unverified.

3. OpenAI-compatible empty-key acceptance criterion is listed but not fully planned.
- The draft states empty-apiKey coverage, but Phase 2 `OpenAICompatProvider.test.ts` tasks only enumerate `buildSystemPrompt` tests.
- Recommendation: add an explicit constructor-path test verifying empty input key follows the placeholder path.

## Medium-Priority Issues

1. Gemini E2E feasibility is overstated.
- Draft says it is directly implementable via mock server extension, but current runtime path does not currently expose a Gemini base URL override like Anthropic/OpenAI paths.
- Recommendation: treat feasibility as uncertain until proven with the existing harness; avoid making it P0-guaranteed without evidence.

2. One use-case statement mixes layers.
- “AgentRunner stderr updates the status element” is a UI (`AgentChatTab`) effect, not an `AgentRunner` integration responsibility.
- Recommendation: split expectations by layer: `AgentRunner` emits `stderr`; `AgentChatTab` renders status text.

## Suggested Edits
1. Remove Phase 7a production changes from Sprint 007 scope.
2. Tighten `runnerFactory` precedence tests to assert which URL was actually used.
3. Add explicit `OpenAICompatProvider` empty-key constructor test task.
4. Rephrase Gemini E2E as timeboxed attempt + explicit defer path if blocked.
5. Keep layer boundaries explicit in use cases and acceptance criteria.

## Verdict
Good draft foundation with strong coverage intent, but not implementation-ready until the Gemini production-change scope and base-URL-precedence proof gap are corrected.
