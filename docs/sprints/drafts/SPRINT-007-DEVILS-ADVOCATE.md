# Sprint 007 Devil's Advocate Review

## Scope of this review
This document intentionally attacks `docs/sprints/SPRINT-007.md` as if approval is blocked until risk is reduced. The goal is to identify where this sprint can pass while still shipping fragile coverage, false confidence, and avoidable rework.

## 1) Flawed assumptions

1. Assumption: this is “gap-filling” with “minimal” source changes.
Reference: `Overview`, `Architecture` (Source changes), `Phase 1`.
Concern: this is not just tests. You are changing provider constructor signatures and runtime wiring (`GeminiProvider(apiKey, baseURL)` via `AgentApiRunner.createProvider()`). That is production behavior, not harmless test exposure.

2. Assumption: exporting private helpers is no-risk.
Reference: `Overview` item 1, `Phase 1`, `Definition of Done` bullets about exported helpers.
Concern: once exported, these become de facto API surface. Future refactors will be constrained by tests coupled to implementation details rather than user-visible behavior.

3. Assumption: `filterOpenAIModelId` is a stable business rule.
Reference: `Use Cases` #3, `Phase 1` predicate, `Phase 2` filter tests.
Concern: hard-coding `gpt-` and `^o\d` assumes model naming conventions are fixed. If OpenAI changes naming, this “coverage” locks in stale behavior and blocks legitimate models.

4. Assumption: constructor-not-throwing proves OpenAI-compat empty-key behavior.
Reference: `Use Cases` #4, `Phase 2` OpenAICompat constructor test.
Concern: no assertion verifies the actual key used downstream. “Does not throw” is a weak proxy that can pass even if the placeholder logic regresses.

5. Assumption: 8192-byte truncation in prompt helper equals safe context handling.
Reference: `Use Cases` #6, `Phase 2` buildSystemPrompt tests, `Phase 3` context payload tests.
Concern: tests assume character-length behavior maps to bytes. Multi-byte input can violate the byte budget while still passing simplistic length assertions.

6. Assumption: Gemini SDK base URL/path behavior is straightforward.
Reference: `Phase 1` note on URL path verification, `Phase 7` spike and expected path.
Concern: the plan admits uncertainty on the exact transport contract while treating Gemini E2E as a committed P0 deliverable.

7. Assumption: no open questions.
Reference: `Open Questions` says none.
Concern: there are unresolved decisions disguised as implementation details (Gemini streaming route semantics, precedence behavior for invalid URL suppression, and exact DoD for runtime safety).

## 2) Scope risks

1. Scope balloon risk: provider test matrix is larger than estimated.
Reference: `Phase 2` (4 new provider test files, 31 tests), `Definition of Done` provider bullets.
Risk: each provider prompt helper has subtle template differences; synchronizing four near-duplicate suites inflates maintenance and review cost.

2. Scope balloon risk: AgentChatTab context tests are brittle by design.
Reference: `Phase 3` context payload assertions, hard-coded `JSON.parse(runner.runCalls[0].context)`.
Risk: tests are tightly coupled to payload shape and serialization. benign refactors (e.g., context object passing) will cause churn.

3. Hidden dependency risk: runner arg ordering assumptions.
Reference: `Phase 4` yoloArgs test requires `--yes` before other args.
Risk: adapter implementations may not guarantee global ordering across all agents. one rigid ordering assertion can cause false failures or force awkward code.

4. Hidden dependency risk: file-op integration relies on a permissive mock handler.
Reference: `Phase 5` note to make stub “accept any op” and return generic success.
Risk: this reduces fidelity exactly where protocol variants are being validated; malformed op payloads can still pass.

5. Underestimated E2E risk: Gemini mock semantics may not match SDK framing.
Reference: `Phase 7` route tasks (`application/json`, array payload), `Risks & Mitigations` Gemini rows.
Risk: if SDK expects chunked framing details different from the mock, the test becomes either flaky or falsely green due to over-simplified response bodies.

6. Underestimated CI risk: this sprint increases reliance on all four suites passing.
Reference: `Definition of Done` includes `npm test`, `test-unit`, `test-integration`, `test-e2e`, and `make test-all`.
Risk: failure triage complexity grows sharply; a “coverage sprint” can consume a full sprint just stabilizing infrastructure.

## 3) Design weaknesses

1. Architecture smell: testing internals over contracts.
Reference: `Overview` item 1, `Phase 1` export strategy.
Weakness: exposing `buildSystemPrompt`, `filterOpenAIModelId`, and `mergeGeminiMessages` prioritizes convenience over stable interfaces. You are hardening private structure, not validating provider outcomes end-to-end.

2. Overfitting to implementation details in UI tests.
Reference: `Phase 3` selectors like `.ai-sidebar-empty` and data-testid-specific assertions.
Weakness: tests can fail on harmless UI refactors while missing behavioral regressions (e.g., wrong run context despite visible messages).

3. Precedence behavior encodes a bad product decision.
Reference: `Use Cases` #12, `Phase 6` invalid settings URL suppresses valid env URL.
Weakness: the plan codifies “broken local setting beats valid fallback.” That is brittle UX and likely to generate support incidents.

4. Gemini baseURL injection is provider-specific patching.
Reference: `Architecture` and `Phase 1` Gemini-only constructor change + `AgentApiRunner` wiring.
Weakness: this repeats per-provider wiring logic instead of centralizing base URL policy. future provider additions will replicate the same plumbing and tests.

5. Integration tests are not truly integration for protocol correctness.
Reference: `Phase 5` file-op variant tests via parser + mock handler.
Weakness: by abstracting execution with a flexible stub, tests validate event emission more than real protocol-to-filesystem behavior.

## 4) Definition of Done gaps

1. Missing DoD for regression safety of production behavior changes.
Reference: `Definition of Done` has build/test checks and helper exports.
Gap: no explicit requirement that Gemini non-baseURL behavior is unchanged in existing API mode flows.

2. Missing DoD for malformed/edge payloads.
Reference: `Phase 5` only validates happy-path variant ops + one handler failure.
Gap: no required tests for malformed JSON blocks, unknown ops, missing fields, or mixed prose+file-op corruption.

3. Missing DoD for concurrency/race behavior in AgentRunner events.
Reference: `Phase 4` tests cover isolated stderr/exit/args cases.
Gap: no required assertions for stderr+stdout interleaving, rapid exit after stderr, or duplicate terminal events.

4. Missing DoD for context-read failure semantics.
Reference: `Use Cases` #6 mentions null on vault read failure, but `Phase 3` tasks omit a read-rejection test.
Gap: a broken exception path can still pass if only no-active-file and truncation paths are tested.

5. Missing DoD for observability quality.
Reference: `Use Cases` #8 says AgentChatTab renders stderr status text; DoD checks only runner stderr emission.
Gap: UI propagation of stderr during real runner flow is not explicitly required in DoD.

6. Missing DoD for deterministic E2E execution when binary exists.
Reference: `Definition of Done` allows graceful skip if Obsidian binary absent.
Gap: sprint can “pass” with no Gemini E2E signal at all on common environments.

7. Missing DoD for backward compatibility of helper exports.
Reference: `Definition of Done` requires exports but not constraints.
Gap: no requirement on naming stability, intended visibility, or prevention of external coupling drift.

## 5) Most likely way this sprint fails

Most likely failure: **Gemini path/baseURL work consumes the sprint while the rest devolves into brittle, implementation-coupled tests that pass without improving real defect detection.**

Reference chain:
1. `Phase 1` and `Phase 7` explicitly depend on uncertain Gemini SDK URL/path behavior.
2. `Risks & Mitigations` already flags SDK baseURL/path uncertainty as medium risk.
3. `Definition of Done` requires four test layers to pass, but E2E can skip when binary is absent.
4. Remaining coverage work leans heavily on exported internals and permissive mocks (`Phase 1`, `Phase 5`).

Failure pattern:
1. Team burns time validating Gemini route/mocking quirks and wiring `baseURL` behavior.
2. To maintain momentum, tests focus on helper internals and easy assertions (constructor no-throw, class instance checks, generic stub success).
3. DoD is met by green suites and/or E2E skips, but runtime confidence barely improves.
4. Next sprint discovers regressions in real provider behavior, context handling edge cases, or protocol robustness that this sprint supposedly “closed.”
