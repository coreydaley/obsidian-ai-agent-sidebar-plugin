# Sprint 008 Devil's Advocate Review

## Scope of this review
This document intentionally attacks `docs/sprints/SPRINT-008.md` as if approval is blocked until risk is reduced. The point is to identify how this sprint can go green while still proving very little about real reliability.

## 1) Flawed assumptions

1. Assumption: “real CLIs + real APIs” means meaningful end-to-end confidence.
Reference: `Overview`, `Use Cases`.
Concern: most assertions are “non-empty response” and “file exists.” That proves activity, not correctness. A hallucinated response, wrong model, wrong tool behavior, or silent fallback can still pass.

2. Assumption: `options.length > 2` proves live model fetch.
Reference: `Model List Assertion`, `Use Cases` #5/#7/#8.
Concern: this is a weak proxy. Static defaults, cached values, or stale persisted settings can satisfy this without any successful live API call.

3. Assumption: missing prerequisites should skip and still count as acceptable verification.
Reference: `Prerequisite Guard Logic`, `Definition of Done` skip bullets, `Observability & Rollback`.
Concern: this plan normalizes “green by skipping.” On a typical machine missing one CLI or key, major coverage disappears and the sprint still claims success.

4. Assumption: `which <cmd>` is a valid readiness check for CLI agents.
Reference: `Phase 2` (`isBinaryInstalled`), `Prerequisite Guard Logic`.
Concern: binary existence is not operability. Expired auth, broken PATH shims, outdated CLI protocol, or interactive login prompts will only be discovered mid-test as flaky failures.

5. Assumption: forcing yolo mode is representative and safe.
Reference: `Overview` (CLI tests with yoloMode enabled), `Phase 3`, `Security Considerations`.
Concern: you are testing the most permissive execution path only. That hides failures in safer/default modes and can mask real permission-path regressions.

6. Assumption: no API key in `data.json` + shell env resolution is deterministic in Electron.
Reference: `Prerequisite Guard Logic` (API), `Definition of Done` API vault bullets.
Concern: env propagation into spawned/electronized contexts is historically fragile. The plan assumes this plumbing works uniformly without a direct assertion that the plugin consumed the expected key source.

7. Assumption: “OpenAI-compatible agent out of scope” is harmless.
Reference: `Overview` last sentence, `Deferred`.
Concern: codex API behavior likely shares OpenAI-family plumbing. Excluding openai-compat leaves a major branch of the highest-risk integration path unvalidated while claiming the “remaining gap” is closed.

## 2) Scope risks

1. Scope underestimation: this is 15 live tests across 6 describes with heavy setup/teardown.
Reference: `Use Cases` (8 scenarios), `Phase 3`, `Phase 4`, runtime note in `Phase 5`.
Risk: 3–8 minute estimate is optimistic once cold starts, provider throttling, and local machine contention are included. Expect repeated reruns and debugging cycles.

2. Hidden dependency: selector and settings-tab coupling.
Reference: `Phase 2` (`navigateToPluginSettings`), `Model List Assertion`, imports from `../e2e/helpers/selectors`.
Risk: this sprint depends on exact UI structure (`.vertical-tab-header`, specific tab text). Minor UI changes in Obsidian or plugin settings layout can cascade into broad false failures.

3. Hidden dependency: provider account state and quotas.
Reference: `Phase 5` prerequisites (valid subscriptions), `Dependencies`, `Risks & Mitigations`.
Risk: model availability, entitlement differences, regional restrictions, and rate limits can change daily. Failures will be ambiguous and expensive to triage.

4. Balloon risk: duplicated test logic across 6 describe blocks.
Reference: `Phase 3` and `Phase 4` mirrored patterns.
Risk: maintaining near-identical flows across agents will drift quickly. Fixes for one provider path may not be propagated, causing inconsistent quality and brittle long-term ownership.

5. Hidden operational risk: artifact management is undefined.
Reference: `Phase 2` screenshot helper, `Security Considerations` artifact note.
Risk: artifacts may leak sensitive responses, and the plan does not require `.gitignore` enforcement or cleanup policy. This is a security/process gap disguised as a testing detail.

## 3) Design weaknesses

1. The plan optimizes for “did something happen” instead of “did the right thing happen.”
Reference: `Use Cases` chat/file checks, `Definition of Done` file-op + poll assertions.
Weakness: existence checks without semantic validation invite false positives. A file with wrong path/content/encoding can still pass.

2. Test architecture hard-codes brittle heuristics instead of contract signals.
Reference: `Model List Assertion` (count + warning text), `Phase 4` model-list task.
Weakness: option-count and warning-copy checks are fragile UI heuristics, not API contract validation. One copy change or new default model count breaks trust in the signal.

3. Skip-heavy gating undermines the stated sprint objective.
Reference: `Prerequisite Guard Logic`, `Definition of Done` skip bullets, `Observability & Rollback` (“Any describe that skips … expected”).
Weakness: a sprint meant to prove live integrations is explicitly designed to tolerate not exercising live integrations.

4. No explicit flake-control strategy for nondeterministic systems.
Reference: `Vitest Config` (timeouts only), `Risks & Mitigations`.
Weakness: there is no retry policy, no diagnostic capture beyond screenshots, no structured logging of prompts/responses/provider errors. Failures will be noisy and hard to root-cause.

5. The copilot known-risk is acknowledged but not engineered around.
Reference: `Phase 5` note (“copilot … may be less reliable”), `Risks & Mitigations`.
Weakness: declaring unreliability in docs is not mitigation. It institutionalizes flaky red builds as acceptable behavior.

## 4) Definition of Done gaps

1. Missing DoD for minimum executed coverage (not skipped).
Reference: `Definition of Done`, `Observability & Rollback`.
Gap: no requirement that each provider path actually ran. This allows “pass” with most describes skipped.

2. Missing DoD for response correctness and protocol integrity.
Reference: `Use Cases`, `Definition of Done` chat/file bullets.
Gap: no requirement to assert response provenance, absence of explicit error states, or exact file-op JSON parsing outcome per provider.

3. Missing DoD for artifact hygiene/security controls.
Reference: `Security Considerations` artifact warning.
Gap: it mentions `.gitignore` conditionally (“if not already covered”) but does not require verification. Sensitive screenshots can slip into commits.

4. Missing DoD for cross-environment determinism.
Reference: `Deferred` (macOS-only), `Dependencies`, `Vitest Config`.
Gap: no matrix or baseline environment definition (Obsidian version, CLI versions, node version). Reproducibility is undefined.

5. Missing DoD for failure diagnostics.
Reference: `Phase 2` screenshot helper, `Risks & Mitigations`.
Gap: screenshots alone are insufficient. There is no mandatory capture of provider stderr/stdout, request metadata, or plugin logs for postmortem.

6. Missing DoD for negative-path confidence in live mode.
Reference: `Deferred` excludes invalid credentials/timeouts.
Gap: live mode only tests happy path; nothing proves graceful handling of the exact classes of failures most likely in production.

## 5) Most likely way this sprint fails

Most likely failure mode: **the suite becomes “mostly skipped + occasionally flaky,” and the team mistakes that for live-integration confidence.**

Reference chain:
1. `Prerequisite Guard Logic` aggressively skips on missing binary/key/launch conditions.
2. `Definition of Done` validates structure and counts, not executed coverage quality.
3. `Risks & Mitigations` already concedes protocol and provider instability (copilot reliability, model-fetch timing).
4. `Use Cases` rely on low-signal assertions (non-empty text, file existence).

Failure sequence:
1. Developers run `make test-e2e-live`; several describes skip due to local setup drift.
2. Remaining describes intermittently fail on provider latency/auth/quota, then pass on rerun.
3. Sprint is marked complete because wiring exists and some tests pass eventually.
4. Production regressions still ship because the suite never enforced deterministic, high-signal proof of correct live behavior.
