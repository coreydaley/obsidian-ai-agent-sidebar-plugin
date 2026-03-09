# Sprint 007 Merge Notes

## Claude Draft Strengths
- Complete sprint document structure (Files Summary, DoD checklist, Risks, Security, Rollback, Dependencies)
- Concrete implementation tasks per phase (verifiable DoD items)
- User interview answers incorporated (Gemini P0, all 4 providers fully tested)
- GeminiProvider baseURL production change planned explicitly
- YOLO args passthrough test included
- runnerFactory precedence approach via `debugMode` + `vi.spyOn(console, "debug")` is observable without mocking constructors

## Claude Draft Weaknesses (from Codex critique)
- `OpenAICompatProvider` empty-key test was listed as a use case but not in Phase 2 task list — gap
- Use case #7 ("AgentRunner stderr updates the status element") conflates layers — the integration test verifies emission, the unit test verifies rendering; these should be stated separately
- runnerFactory precedence tests in Phase 6 only asserted `instanceof AgentApiRunner`, which doesn't distinguish which URL was selected

## Codex Draft Strengths
- Clean phase structure with explicit scope boundaries
- "Decision-mandatory" Gemini framing: either ship or formally document infeasibility
- Identifies openAI-compat empty-key gap (even though Codex didn't add the task either)
- Correct layer-boundary observation

## Codex Draft Weaknesses (from Claude critique)
- Conflicts with user interview decision: Gemini E2E should be P0 with baseURL production change
- Missing YOLO args passthrough test
- Missing required sprint document sections (DoD, Files Summary, Security, etc.)
- runnerFactory precedence concern raised but not resolved

## Valid Critiques Accepted
- Add explicit `OpenAICompatProvider` empty-key constructor test to Phase 2
- Clarify layer boundaries in use cases and DoD items (AgentRunner emits stderr; AgentChatTab renders it)
- Strengthen runnerFactory precedence tests: use `vi.spyOn(console, "debug")` in debugMode to verify the "invalid settings URL silences valid env URL" behavior, OR assert behavioral divergence by checking runner is still AgentApiRunner (API key still works) while baseURL is undefined (debug log fired)

## Critiques Rejected (with reasoning)
- Remove GeminiProvider baseURL production change: User explicitly approved this in interview; it's a 2-line change following established patterns
- Treat Gemini E2E as uncertain/infeasible: User chose P0; we include it with a documented spike-verification step
- Reject "all 4 providers fully": User confirmed in interview

## Interview Refinements Applied
- Gemini E2E: P0 (not P1), includes GeminiProvider baseURL production change
- Provider tests: All 4 providers get full 6-test buildSystemPrompt suite

## Final Decisions
- Sprint size: Well-scoped for a single sprint. The work is pure test additions + 2-line GeminiProvider change. No new infrastructure.
- Phase order: Provider exports → Provider unit tests → AgentChatTab P1 → AgentRunner integration → AgentApiRunner integration → runnerFactory → GeminiProvider production change → mockApiServer Gemini routes → Gemini E2E
- DoD focus: All tests pass on all 4 test commands; no production behavior changes except GeminiProvider baseURL addition

## Simplest Viable Filter Applied
- Removed `debugMode: true` path test from P0 (moved to P1) — it's a narrow UI branch
- Removed FileOperationsHandler `list` with nonexistent path from P0 (P1) — existing coverage is adequate
- FileOperationsHandler nested folder write deferred — acceptable gap for now
- runnerFactory precedence test: behavioral proxy via debugMode spy is sufficient; no need to mock constructors
