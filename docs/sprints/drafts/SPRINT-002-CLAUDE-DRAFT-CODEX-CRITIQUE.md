# Sprint 002 Claude Draft Critique (by Codex)

## Summary
Claude's draft is strong on end-to-end intent coverage and gives a concrete implementation shape for API mode. The main weaknesses are scope expansion beyond the sprint intent, a few architecture mismatches with the current codebase, and some assumptions that should remain open decisions until validated.

## What Claude Draft Does Well
- Correctly reframes settings around providers (Anthropic/OpenAI/Google/GitHub).
- Captures core gating rules: disable enable-toggle and unavailable access modes.
- Preserves backward compatibility goal for existing CLI users.
- Includes clear Definition of Done and risk/security sections.
- Identifies environment-variable names and mode constraints (Gemini API-only, Copilot CLI-only) correctly.

## Critical Issues

1. Scope creep beyond sprint intent.
- The draft introduces model dropdowns with provider model fetches, persisted model selection, and chat clearing on mode switch under "Interview Refinements." These are not required by the intent and materially expand UI/API complexity.
- Recommendation: defer model discovery/dropdowns and mode-switch history semantics to a follow-up sprint.

2. Architecture mismatch with current runtime wiring.
- Draft assigns runner factory logic to `AgentChatTab`, but runner construction currently happens in `AgentSidebarView.addAgentTab()`.
- Recommendation: keep mode-based runner selection in `AgentSidebarView` (or a shared runner factory used there), not inside `AgentChatTab`.

3. Event interface drift risk.
- Draft proposes `done` / `fileOpEnd` event names for `AgentApiRunner`; current consumers expect `complete` / `fileOpResult`.
- Recommendation: enforce a strict shared runner event contract and keep existing event names to avoid UI regressions.

4. Assumptions presented as resolved decisions without source of truth.
- "Open Questions (Resolved)" and "Interview Refinements" appear to lock decisions (SDK choice, model dropdown) that are not in the provided sprint intent document.
- Recommendation: keep these as open decisions unless product owner explicitly confirms.

## Medium Priority Gaps

1. Detection abstraction is still agent-centric, not explicitly provider-capability-centric.
- Current proposal adds `hasApiKey` to agent detection but does not clearly define a single capability registry consumed by settings, detector, and runtime.
- Recommendation: define one canonical provider/agent capability map to prevent drift.

2. Shared login-shell env source is implied but not made explicit as a reusable utility.
- Detector and API runner both need identical env resolution behavior.
- Recommendation: extract `resolveShellEnv()` into shared utility and use it consistently.

3. "Hide/disable Extra CLI arguments input in chat" is misplaced.
- Extra CLI args live in settings, not chat UI.
- Recommendation: scope this requirement to settings rendering only.

4. Security note about renderer CSP is speculative for sprint planning.
- Recommendation: avoid asserting CSP/runtime behavior; frame as "validate in dev vault" with fallback plan.

## Suggested Edits to Claude Draft
1. Remove model dropdown/model-fetch requirements from Sprint 002 scope.
2. Move runner-selection responsibility to `AgentSidebarView` (or a dedicated factory called there).
3. Define a shared `AgentExecutionRunner` contract with existing event names (`token`, `stderr`, `fileOpStart`, `fileOpResult`, `complete`, `error`).
4. Add explicit shared capability registry as a first-class artifact.
5. Keep SDK-vs-fetch as an open decision unless owner confirms.
6. Replace speculative runtime claims with testable validation steps.

## Verdict
Claude's draft is directionally correct and close to executable. After tightening scope to the stated intent and aligning integration details with the current code structure, it becomes a lower-risk Sprint 002 plan.
