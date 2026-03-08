# Sprint 003 Devil's Advocate Review

## Scope of this review
This document intentionally challenges `docs/sprints/SPRINT-003.md` from a pre-implementation approval standpoint. The bar here is: if any of these concerns are real, this sprint can still "pass" while leaving major risk in production.

## 1) Flawed assumptions

1. Assumption: a Node-only test harness is representative enough for Obsidian runtime behavior.
Reference: `Overview` ("without requiring Obsidian"), `Obsidian mock strategy`.
Concern: The plan assumes the mocked `obsidian` surface captures all behavior that matters. That is optimistic. `instanceof` compatibility and basic method presence are not equivalent to runtime parity. If Obsidian object lifecycles, path normalization quirks, or Notice behavior differ, these tests can create false confidence.

2. Assumption: `normalizePath` can be simplified without consequence.
Reference: `Obsidian mock strategy` ("normalizePath must return input unchanged"), Phase 1 task later showing `replace(/\\/g, "/")`.
Concern: The plan is internally inconsistent and functionally risky. One place says "unchanged," another says backslash normalization. Neither validates that behavior matches real Obsidian normalization. Security-sensitive path traversal tests become suspect if your normalization contract is guessed.

3. Assumption: one optional DI parameter in `AgentApiRunner` is "minimal" and harmless.
Reference: `Overview` ("one minimal production-code change"), `AgentApiRunner testability seam`, DoD item on not breaking callers.
Concern: Constructor signature growth can break call sites indirectly (factory wrappers, subclassing assumptions, argument-position mistakes in JS callers). The plan treats this as trivial without proving there are no overload or runtime ambiguity hazards.

4. Assumption: fake timers prove real timeout behavior.
Reference: Phase 4 inactivity timeout test with `vi.useFakeTimers()`, DoD timeout item.
Concern: Fake timers test logic flow, not event-loop/starvation behavior under real async streams and real provider adapters. You can pass this test and still miss production hangs caused by microtask/macrotask interactions.

5. Assumption: deterministic means non-flaky because `sleep` is avoided.
Reference: `Risks & Mitigations` fake subprocess timing mitigation.
Concern: The suite still depends on real filesystem and subprocess scheduling (`fakeAgent.ts`, `os.tmpdir()`, stream chunking). "No sleep" is not enough to guarantee determinism across CI load profiles.

## 2) Scope risks

1. Hidden dependency explosion in test doubles.
Reference: Architecture helper list, Phase 1 (`mockObsidian.ts`, `mockVault.ts`, `fakeAgent.ts`, `streamFixtures.ts`).
Risk: You are building a mini runtime. `MockVault` + `MockApp` + `Notice` + fileManager + fs-backed behavior is effectively a parallel platform. Maintaining these doubles can become more work than the tests they enable.

2. Runner-factory coverage claims are broader than planned implementation confidence.
Reference: Phase 5 six scenarios + DoD "cover all 4 access-mode/capability combinations".
Risk: Factory behavior depends on interactions with detection, model sanitation, API key resolution, and runner side effects. Current plan tests snapshots of outcomes, not matrix completeness across agents/providers. "4 combinations" is likely underspecified and will drift as settings evolve.

3. Streaming parser scenario count underestimates combinatorial edge cases.
Reference: Phase 3/4 parser tests + Verification Matrix.
Risk: The plan focuses on opener/closer split and malformed JSON. It omits adversarial cases: nested delimiters in content, huge payload boundaries, unicode boundary splits, interleaved stderr, and partial EOF without closer. Parser bugs usually live there.

4. Shell environment tests likely brittle and platform-coupled.
Reference: Phase 7 shell-env tests.
Risk: "stub shell command to nonexistent path" assumes implementation has injectable shell command. If not, tests either become invasive (production seams added) or superficial. This can balloon into refactors not budgeted in a "~5%" phase.

5. Time budget percentages are not credible for integration-first infra work.
Reference: Phase percentage allocations.
Risk: Phase 1 alone contains most hard work (config split, full obsidian mock, fs-backed vault, fake subprocess infra, prod DI seam). Calling that ~20% is likely wrong and hides schedule risk.

## 3) Design weaknesses

1. Over-mocking the host platform instead of testing seams at boundaries.
Reference: `Obsidian mock strategy`, `mockVault.ts` design.
Weakness: The design chooses deep emulation over narrow contracts. That increases coupling to implementation details (`instanceof`, class shape, message DOM methods) and makes refactors expensive.

2. Integration suite split into separate config may create blind spots.
Reference: `vitest.integration.config.ts` isolated from existing suite.
Weakness: Separate config is useful, but it can diverge in transforms, aliases, setup order, and globals. Bugs can disappear in one config and appear in another. Plan does not require parity checks between unit/integration config behavior.

3. Security validation focuses on string patterns, not invariant enforcement.
Reference: Phase 2 traversal tests and verification entries expecting error text `/resolves outside vault root/`.
Weakness: Asserting specific error strings encourages brittle tests and misses invariant checks (e.g., canonical resolved path never escapes root). Security tests should verify invariant outcomes, not message wording.

4. Fake-agent subprocess model may not resemble real agent output characteristics.
Reference: `fakeAgent.ts` sequential stdout writes with small delays.
Weakness: Real CLIs may emit mixed stdout/stderr, buffered chunks, non-UTF8 bytes, and abrupt termination. The proposed fake script is too clean; parser confidence will be inflated.

5. No strategy for contract testing provider adapters.
Reference: Phase 4 `MockProviderAdapter` inline class.
Weakness: Inline minimal adapter validates only happy-path stream iteration. It does not enforce provider adapter contract consistency across Anthropic/OpenAI/Google adapters, where regressions are likely.

## 4) Definition of Done gaps

1. Missing performance/regression thresholds.
Reference: DoD has pass/fail checks only.
Gap: No runtime ceiling or resource-use expectations for integration tests. CI could become slow/flaky and still "done."

2. Missing negative assertions for side effects.
Reference: DoD and Verification Matrix around dispose/cancel/timeouts.
Gap: It checks that events happen, not that forbidden things do not happen (e.g., no file mutation on failed traversal, no extra events after timeout/dispose, no leaked subprocesses).

3. Missing cross-platform expectations.
Reference: Entire plan assumes Node + `os.tmpdir()` + path behaviors but no OS matrix in DoD.
Gap: Path handling and shell env behavior differ materially on macOS/Linux/Windows. DoD allows a suite that passes locally and fails in other CI environments.

4. Missing validation of test isolation and cleanup integrity.
Reference: Risk mitigation mentions temp dirs and `afterEach`.
Gap: DoD does not require proof of no leaked temp directories, open handles, or orphaned subprocesses. Integration suites rot fast when cleanup is not enforced.

5. Missing quality gate on assertion strength.
Reference: Many tests validate coarse outcomes ("starts without immediate error", "returns object").
Gap: Weak assertions can pass broken implementations. DoD should require assertion of semantic correctness, not just non-crash behavior.

6. Missing backward-compatibility proof for `AgentApiRunner` signature change.
Reference: DoD says param does not break callers.
Gap: There is no explicit requirement to test existing call sites/factory wiring unchanged. This is asserted, not verified.

## 5) Most likely failure mode

The most likely failure is a **high-maintenance, low-signal test suite** that passes CI while missing real regressions.

Why this is likely:
- The plan invests heavily in mocks and harness infrastructure (`mockObsidian`, `mockVault`, `fakeAgent`) rather than validating behavior against realistic host/runtime boundaries.
- Core parser/security tests are narrow and message-string-oriented, not invariant-oriented.
- DoD emphasizes "tests exist and pass" over "tests are strong, representative, and stable." 

Failure pattern you should expect:
1. Sprint ships with green `make test-integration`.
2. A real-world parser/path/runtime issue appears in production.
3. Team patches mocks/tests to match implementation details, increasing coupling.
4. Integration suite becomes slower and noisier, and developers stop trusting failures.

Relevant plan anchors: `Architecture` helper-heavy approach, Phases 1-4 design choices, DoD pass-centric criteria, and Risks table mitigation assumptions.
