# Sprint 005 Devil's Advocate Review

## Scope of this review
This document intentionally attacks `docs/sprints/SPRINT-005.md` before implementation. The objective is to identify how this sprint can look complete while still shipping brittle behavior, false confidence, and maintenance debt.

## 1) Flawed assumptions

1. Assumption: direct binary spawn is a solved problem, not a discovery spike.
Reference: `Harness Env Injection` (lines 74-86), `Open Questions` #1 (line 373).
Concern: The plan treats a platform-critical uncertainty as an implementation detail in Phase 4. If this assumption is wrong, most of P0 E2E scope is blocked.

2. Assumption: malformed/empty base URL should silently fall back with no signal.
Reference: `Use Cases` #5 (line 23), `URL Validation` (lines 61-71).
Concern: Silent fallback masks misconfiguration and sends traffic to real vendor endpoints unexpectedly, which is exactly the opposite of what test/proxy users intend.

3. Assumption: one `isValidBaseUrl` check is sufficient correctness.
Reference: `URL Validation` (lines 61-70), Phase 3 snippet (lines 178-183).
Concern: Validation only checks URL parse + protocol. It ignores trailing path semantics, accidental query fragments, and per-SDK expectations for `baseURL` normalization. "Valid URL" is not "safe/compatible SDK base URL."

4. Assumption: mock SSE examples are close enough to real provider behavior.
Reference: `Mock Server Protocol` (lines 87-140), `Risks & Mitigations` SSE risk row (line 338).
Concern: Real streaming behavior includes timing, chunk boundaries, and occasional partial/metadata events. A deterministic happy-path stream can pass while production parsing remains fragile.

5. Assumption: `requestCount(path) === 1` proves routing correctness.
Reference: Phase 8 assertions (line 262), `Observability & Rollback` correctness proof (line 355).
Concern: One request proves only "a request happened." It does not prove correct headers, payload model, auth propagation, streaming completion, or that retries/backoff logic did not misbehave.

## 2) Scope risks

1. Harness refactor is under-scoped and coupled to OS/app startup behavior.
Reference: Phase 4 tasks (lines 185-202), risk table launch row (line 336), `Deferred` cross-platform note (line 287).
Risk: A launch-path change can break existing E2E, app focus, vault selection, and CDP connection timing. This is larger than a 15% phase implies.

2. P0 quietly depends on unresolved cache isolation behavior.
Reference: Phase 9 note (line 276), `Open Questions` #2 (line 374).
Risk: Module-cache flakiness can poison test determinism and consume disproportionate debugging time late in sprint.

3. The "no new dependencies" constraint pushes custom infra risk into test code.
Reference: Overview (line 15), Phase 6 mock server (lines 214-224).
Risk: Reimplementing protocol behavior manually without battle-tested helpers increases maintenance cost and edge-case bugs.

4. Error-path E2E is loosely specified and likely to become flaky.
Reference: Phase 8 error assertion options (line 263).
Risk: Allowing multiple heuristic pass conditions (`.ai-agent-error` OR regex OR assistant contains "error") makes this test permissive and nondeterministic.

5. Gemini is marked P1 but threaded through P0 design surfaces.
Reference: Architecture + env mapping include Gemini (lines 32, 55, 163), P1 list (lines 278-282).
Risk: Partial Gemini wiring increases conditional complexity now and invites inconsistent behavior between providers.

## 3) Design weaknesses

1. Validation logic is split across `runnerFactory` and provider constructors.
Reference: `URL Validation` defense-in-depth statement (line 70), Phase 2 provider guards (lines 170-172).
Weakness: Duplication creates drift risk. One layer will eventually accept/reject values differently, producing hard-to-debug provider-specific behavior.

2. Production behavior is being shaped around test harness constraints.
Reference: `Approach` + `Harness Env Injection` (lines 11-14, 74-86).
Weakness: The architecture prioritizes making E2E possible on macOS rather than defining a clear runtime contract for endpoint override across environments.

3. Data-testid additions are tied to rendering internals (streaming container specifics).
Reference: Phase 7 requirement on `createStreamingMessage` (line 230), DoD line 327.
Weakness: Tests become coupled to implementation detail instead of stable UI semantics; harmless render refactors will break tests.

4. Mock server API surface is too narrow for forward compatibility.
Reference: `MockServer` interface (lines 142-149), routes (lines 91-140).
Weakness: No facility for scripted multi-turn behavior, delayed chunks, non-200 responses per step, or header/payload assertions. You will rewrite this once tests expand.

5. Rollback story understates integration coupling.
Reference: `Observability & Rollback` (line 356), file summary breadth (lines 295-307).
Weakness: Claiming rollback is basically `runnerFactory` revert ignores constructor signature changes, harness launch changes, and new tests bound to these contracts.

## 4) Definition of Done gaps

1. No DoD requirement to verify env override is never used in CLI-only/openai-compat paths.
Reference: env mapping exclusion note (line 57), file summary includes broad runner changes (lines 299-300), DoD list (lines 311-331).
Gap: Regressions could leak override behavior into unintended providers/modes with no explicit gate.

2. No assertion that invalid override produces an observable diagnostic.
Reference: silent fallback behavior (lines 23, 70), DoD invalid-url item (line 319).
Gap: Misconfigured environments pass silently; users and CI get no actionable signal.

3. No DoD check for stream lifecycle correctness in UI.
Reference: Phase 8 focuses on final text presence (lines 261-263), DoD success checks (lines 320-322).
Gap: Tests can pass even if partial tokens render incorrectly, duplicate, or fail to finalize cleanly.

4. No requirement for repeated-run flake tolerance.
Reference: reliability intent in Overview (line 7), DoD has single-run pass criteria only (lines 311-331).
Gap: A one-off pass can mask timing races in CDP launch, stream handling, and teardown.

5. No DoD for teardown hygiene beyond mock server close.
Reference: DoD line 328, Phase 8 lifecycle notes (lines 254-255).
Gap: Missing checks for orphaned Obsidian processes, reused debug ports, and vault cleanup integrity can poison subsequent runs.

## 5) Most likely way this sprint fails

Most likely failure: **the harness refactor destabilizes E2E startup, and teams lower the bar to "passes on one machine" while keeping weak chat assertions.**

Why this is the highest-probability failure path:
1. The plan's critical launch assumption is still an open question (`Open Questions` #1, line 373) but sits on the P0 critical path (`Phase 4`, lines 185-202).
2. The core proof of correctness is shallow (`requestCount === 1`, line 355) and final-text UI presence (`lines 261-263, 320-322`).
3. Skip behavior for missing app plus macOS-only scope (`line 314`, `line 287`) makes it easy to declare success without durable, portable execution.

Expected failure pattern:
1. Initial implementation works on one developer macOS setup.
2. Obsidian version/startup variance breaks launch or timing.
3. Tests become flaky or frequently skipped; assertions still pass when they run.
4. Sprint is marked done, but the suite does not provide trustworthy regression protection.
