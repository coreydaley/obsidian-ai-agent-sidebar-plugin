# Sprint 010 Devil's Advocate Review

## Scope of this review
This review assumes `docs/sprints/SPRINT-010.md` must prove it will deliver durable cross-platform behavior, not just make CI green once. Approval is blocked unless the risks below are addressed.

## 1) Flawed assumptions

1. Assumption: “surgical changes” are enough for true cross-platform correctness.
Reference: `Overview` (“The fixes are surgical”), `Architecture` (“No architectural changes”).
Concern: this treats platform divergence as a few branch conditions, but process spawning, shell semantics, encoding, and PATH resolution are systemic concerns. Minimal edits can hide fragile behavior behind passing happy-path tests.

2. Assumption: skipping Windows E2E still provides sufficient confidence for Windows runtime behavior.
Reference: `Overview` (Windows E2E out of scope), `Known Gaps` (Windows E2E not implemented).
Concern: the sprint claims cross-platform reliability while explicitly excluding the only environment where Electron + plugin startup behavior is exercised end-to-end on Windows.

3. Assumption: `process.env` on Windows is a complete replacement for login-shell resolution.
Reference: `Implementation Plan` task for `src/shellEnv.ts` (“Windows has no `$SHELL`… `process.env` already contains variables”).
Concern: this ignores environment variable propagation edge cases (service-launched app, stale process environment, different launch contexts). The plan assumes equivalence without proving it.

4. Assumption: unit tests can reliably mock `process.platform` and still validate real behavior.
Reference: `Implementation Plan` unit test tasks; `Risks & Mitigations` row on mocking `process.platform`.
Concern: these tests mostly validate mock plumbing, not runtime reality. If mocking is wrong or brittle, you get false confidence while platform-specific failures remain.

5. Assumption: static grep is meaningful evidence of cross-platform safety.
Reference: `Implementation Plan` static audit grep command; `Definition of Done` grep-based checks.
Concern: grep checks token presence, not behavior. A call can remain unsafe despite matching patterns, and dynamic calls can escape simple regex audits.

6. Assumption: “No open questions” is credible.
Reference: `Open Questions` (“None — resolved in planning”).
Concern: given explicit Windows E2E deferral, this is unrealistic. Claiming no open questions signals planning closure theater, not risk ownership.

## 2) Scope risks

1. CI scope expansion is underestimated.
Reference: `Overview` (CI on all three platforms), `Implementation Plan` `.github/workflows/ci.yml` matrix expansion.
Risk: Windows runners have different timing and filesystem behavior; integration tests often expose latent flakiness. This can create a sustained CI instability tax beyond the sprint budget.

2. Process management changes can balloon into reliability work.
Reference: `Implementation Plan` `electronHarness.ts` tasklist/taskkill branches.
Risk: parsing localized `tasklist` output, zombie process cleanup, and race conditions around app shutdown are non-trivial and can cascade into retries/timeouts not planned here.

3. Hidden dependency: command availability and shell behavior in test contexts.
Reference: `Risks & Mitigations` (`tasklist`/`taskkill` assumed built-in), `Security Considerations` command usage claims.
Risk: runner images, shells, and PATH setup differ; “built into Windows” does not guarantee predictable invocation under all CI shells.

4. Scope leak from “cosmetic” `chmodSync` guard.
Reference: `Architecture` key finding (“fakeAgent.ts already cross-platform”), `Implementation Plan` fakeAgent task.
Risk: labeling this cosmetic discourages deep validation. If helper scripts are consumed elsewhere, permission handling can still break non-Windows paths.

5. Documentation work is under-scoped for support reality.
Reference: `P1` README support table update, `Known Gaps` Windows E2E absence.
Risk: once matrix CI is enabled, docs need exact platform guarantees and caveats. A light P1 note is likely insufficient and will drift quickly.

## 3) Design weaknesses

1. Platform branching is duplicated at call sites with no central contract.
Reference: `Architecture` (“No architectural changes. All changes are conditional branches at existing call sites.”).
Weakness: this hard-codes OS logic across files, increasing divergence and making future fixes inconsistent.

2. Command execution relies on brittle string commands.
Reference: `Implementation Plan` `liveHelpers.ts` (`where ${cmd}` / `which ${cmd}`), `electronHarness.ts` command calls.
Weakness: string-built commands are error-prone, hard to validate, and couple behavior to shell parsing details.

3. Lifecycle handling in E2E helper is becoming a platform switchboard.
Reference: `Implementation Plan` `electronHarness.ts` adds separate branches for macOS/Linux/Windows in both detect and close paths.
Weakness: this concentrates fragile process-control logic in one helper without abstraction or shared invariants; each future platform fix gets harder and riskier.

4. Deferred Windows launcher design creates an intentional dead-end.
Reference: `Implementation Plan` keeps `launchObsidian()` throwing on Windows; `Deferred` includes `launchObsidianWindows()`.
Weakness: shipping deliberate throw-paths in core test harness cements technical debt and normalizes unsupported behavior in a “cross-platform” sprint.

5. Test strategy overweights unit assertions for OS behavior.
Reference: `Use Cases` and `Definition of Done` emphasize unit/integration evidence for Windows.
Weakness: platform behavior is most failure-prone at system boundaries. Unit-level proof for command selection is weak assurance compared to real process execution.

## 4) Gaps in the Definition of Done

1. Missing DoD: real Windows execution proof for the changed process commands.
Reference: `Definition of Done` contains no step requiring execution of `tasklist`, `taskkill`, or `where` on Windows in a realistic harness.
Gap: a bad implementation can pass with mocks and still fail on real runner/process state.

2. Missing DoD: regression guard for plugin runtime behavior under Windows startup contexts.
Reference: `Definition of Done` only says `shellEnv.ts` doesn’t spawn subprocess on Windows.
Gap: this checks an implementation detail, not outcome correctness (env variables actually available where needed).

3. Missing DoD: negative-path assertions.
Reference: entire `Definition of Done` is happy-path plus grep checks.
Gap: no required tests for missing commands, command failures, or partial process termination, so brittle error handling can ship.

4. Missing DoD: flake-resistance criteria.
Reference: `Definition of Done` requires pass/fail once; `Observability & Rollback` relies on standard CI runs.
Gap: no repeated-run or retry-noise threshold. Intermittent failures can be accepted as “done.”

5. Missing DoD: explicit ownership of deferred Windows E2E timeline.
Reference: `Deferred` and `Known Gaps` list Windows E2E gap with no target sprint or trigger.
Gap: this allows indefinite deferral while claiming cross-platform compatibility progress.

6. Missing DoD: verification that macOS/Linux behavior is functionally unchanged beyond CI status.
Reference: `Definition of Done` says “no CI regressions.”
Gap: CI green is not sufficient proof when process lifecycle logic is modified; behavior-level checks are missing.

## 5) Most likely way this sprint fails

Most likely failure mode: **the sprint ships “green” CI with mocked platform confidence, then fails in real Windows usage because system-boundary behavior was never truly validated.**

Reference chain:
1. `Overview` excludes Windows E2E while claiming cross-platform reliability gains.
2. `Architecture` chooses distributed call-site branching over centralized platform handling.
3. `Implementation Plan` leans on command substitutions and mock-heavy unit tests.
4. `Definition of Done` rewards grep checks and single-pass CI outcomes.

Failure sequence:
1. Code lands with new Windows branches and unit tests that pass via platform mocking.
2. Matrix CI intermittently passes; instability is written off as runner noise.
3. Real Windows environment hits command/path/process edge cases not represented by tests.
4. Team reopens the same files in a follow-up sprint under incident pressure, paying rework cost that this sprint said it would avoid.
