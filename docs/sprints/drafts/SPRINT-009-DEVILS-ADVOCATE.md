# Sprint 009 Devil's Advocate Review

## Scope of this review
This document assumes the burden of proof is on `docs/sprints/SPRINT-009.md`. Approval is blocked unless this plan demonstrates it will produce durable signal instead of a fragile local demo.

## 1) Flawed assumptions

1. Assumption: a tiny local model is representative of the OpenAI-compatible path.
Reference: `Overview` (selected model `smollm2:135m`), `Risks & Mitigations` row “`smollm2:135m` does not follow file-op protocol”.
Concern: this assumes protocol behavior from a very small model with weak instruction-following. If it fails, you learn nothing about provider integration; if it passes, you still have weak evidence because success could be accidental echo behavior.

2. Assumption: “model appears in `/v1/models`” means the runtime is ready for inference.
Reference: `dockerHelpers.ts Interface` (`waitForOllamaReady`), `Definition of Done` readiness checks.
Concern: model listing is metadata availability, not end-to-end generation readiness. Cold-load, first-token latency, or stalled inference can still fail after readiness claims green.

3. Assumption: fixed startup sleep (`setTimeout(..., 3000)`) is sufficient.
Reference: `Implementation Plan` Phase 4 `startOllamaContainer` step 3.
Concern: arbitrary sleeps are nondeterministic and machine-dependent. On slower hosts this creates random boot races and flaky failures.

4. Assumption: throwing when port 11434 is occupied is acceptable behavior.
Reference: `Test Structure` beforeAll step 3, `Risks & Mitigations` row “Port 11434 in use”.
Concern: this treats a normal developer state (local Ollama already running) as hard failure instead of reusable dependency. The plan optimizes for narrow lab conditions, not real dev environments.

5. Assumption: no API key path is adequately tested by setting empty key.
Reference: `Test Structure` seeded vault (`openaiCompatApiKey: ""`), `Security Considerations` “No API keys”.
Concern: this validates only one auth branch. It ignores compatibility breakage in non-empty key handling, which is a core OpenAI-compat expectation.

6. Assumption: interview closure means no unresolved product risk.
Reference: `Open Questions` says “None”.
Concern: that is implausible given known ambiguity around model determinism, Docker variance, and skip semantics. “No open questions” reads like process theater, not engineering reality.

## 2) Scope risks

1. Hidden dependency: Docker CLI/daemon behavior differences across versions and OS virtualization settings.
Reference: `Dependencies` (Docker Desktop required), `isDockerAvailable` in Phase 4.
Risk: the plan reduces dependency validation to `docker info`. It ignores version-specific runtime issues, cgroup/memory constraints, and architecture mismatches that cause non-actionable failures.

2. Underestimated flake surface from external processes in one test lifecycle.
Reference: `Test Structure` beforeAll sequence (binary lookup, Docker start, pull, readiness, vault create, app launch, UI nav), `Phase 5` two tests.
Risk: this is a long chain of coupled moving parts with single-point failure in setup. One intermittent failure burns the whole suite and obscures root cause.

3. Scope balloon risk in maintenance burden.
Reference: `Files Summary` (new helper + new live test + config + docs + Makefile + package scripts), `Definition of Done` broad checklist.
Risk: this sprint claims “gap closure” but introduces another isolated command path and exclusion rule. Each additional lane increases long-term drift and breakage risk.

4. Hidden dependency on plugin/UI selector stability.
Reference: `Test Structure` uses `TAB_BTN_OPENAI_COMPAT`, `openSidebar`, and `CHAT_ERROR`; `Phase 5` import list.
Risk: minor UI changes will fail this suite independent of provider correctness, creating noisy regressions and reducing trust in failures.

5. Time/capacity underestimation for first-run cold paths.
Reference: `Overview` infra challenge, `Risks & Mitigations` rows for image/model pull time.
Risk: “small model” framing underplays cold pull, startup, and CPU inference variability. First-run developer experience is likely much worse than implied and will cause repeated reruns.

## 3) Design weaknesses

1. Over-coupled setup: test orchestration and infrastructure management are fused in a single suite.
Reference: `Test Structure` and `dockerHelpers.ts Interface`.
Weakness: when the test fails, you cannot quickly isolate whether fault is Docker lifecycle, model readiness, UI automation, provider adapter, or file-op behavior.

2. Global fixed resource naming invites collisions.
Reference: `dockerHelpers.ts Interface` constants (`obsidian-e2e-ollama`, port `11434`).
Weakness: static container/port values prevent safe parallel runs and conflict with existing local tooling. This architecture does not scale past one developer running one job.

3. Exclude-by-default plus explicit-path override is brittle policy encoding.
Reference: `vitest.e2e-live.config.ts Change` (exclude pattern + CLI path override).
Weakness: this relies on tool-specific precedence behavior and tribal knowledge. A future runner/wrapper change can silently alter what runs.

4. `execSync`-heavy orchestration blocks observability and responsiveness.
Reference: `Implementation Plan` Phase 4 (`docker rm`, `docker run`, `docker exec pull`, `docker stop/rm` with `execSync`).
Weakness: synchronous shelling limits structured logs, cancellation behavior, and granular error classification. Failures become opaque command exceptions.

5. Success criteria are low-signal smoke checks.
Reference: `Definition of Done` chat test (`CHAT_ERROR count is 0`) and file creation test (`pollForFile` + static content).
Weakness: these checks can pass while returning wrong semantics, partial responses, malformed protocol handling, or wrong model/provider selection.

## 4) Definition of Done gaps

1. Missing DoD: assertion that the request actually hit the configured OpenAI-compatible endpoint.
Reference: `Definition of Done` vault seeding item.
Gap: no network/request-level proof ties UI success to `openaiCompatBaseUrl`. A fallback path could still pass.

2. Missing DoD: deterministic failure diagnostics for flaky live failures.
Reference: `Definition of Done` only requires screenshots; `Observability & Rollback` minimal post-ship verification.
Gap: no requirement for capturing container logs, provider payload summaries, or timing breakdowns, so failures will be costly to triage.

3. Missing DoD: behavior under pre-existing local Ollama.
Reference: DoD requires throw on occupied port; `Risks & Mitigations` port row.
Gap: no pass criterion for coexistence path. This normal developer setup is explicitly unsupported yet not treated as a product-quality deficiency.

4. Missing DoD: resilience thresholds.
Reference: `Definition of Done` final item “both tests pass”.
Gap: one green run is insufficient for live infra confidence. No repeat-run criterion means flakiness can be shipped as “done.”

5. Missing DoD: negative-path coverage for the same integration.
Reference: `Deferred` section omits settings validation and broader paths; DoD focuses only happy path.
Gap: no test for model-not-found, unreachable base URL, or startup timeout recovery. A fragile implementation can still satisfy every listed checkbox.

6. Missing DoD: verification that skip logic does not hide execution.
Reference: `Definition of Done` validates env-var normalization and skip behavior.
Gap: plan tests that skipping works, but not that intended execution occurs when skip vars are absent. This is backwards for confidence.

## 5) Most likely way this sprint fails

Most likely failure mode: **the suite becomes an intermittently red local-only harness that teams rerun until green, then treat as proof of OpenAI-compat reliability.**

Reference chain:
1. `Test Structure` front-loads a long, failure-prone setup chain.
2. `Implementation Plan` Phase 4 uses fixed sleep and blocking shell commands.
3. `Definition of Done` accepts low-signal assertions and a single successful run.
4. `Risks & Mitigations` already acknowledges protocol fragility and environmental variability.

Failure sequence:
1. First cold run times out on pull/readiness or fails due to local port collision.
2. Developer tweaks environment and reruns until setup passes once.
3. Chat/file smoke checks pass without proving endpoint correctness or protocol robustness.
4. Sprint is marked complete; later regressions appear in real environments (different Docker state, model behavior variance, or provider-path drift) because this plan certified only a narrow happy-path demo.
