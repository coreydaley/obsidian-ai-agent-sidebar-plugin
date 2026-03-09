# Sprint 006 Devil's Advocate Review

## Scope of this review
This document intentionally attacks `docs/sprints/SPRINT-006.md` as if approval is blocked until risk is reduced. The goal is to identify how this sprint can claim success while still delivering brittle tests, false confidence, and hidden maintenance cost.

## 1) Flawed assumptions

1. Assumption: “no production source changes required” means low risk.
Reference: `Overview` (final line), `Files Summary` (test/config-only changes).
Concern: This is a test-only sprint touching lifecycle semantics (`AgentChatTab` events, runner switching). If tests are wrong, they cement wrong behavior with zero production pressure to reveal it.

2. Assumption: EventEmitter stubs are representative enough of real runners.
Reference: `Overview` item 1, `MockRunner`, `Use Cases` 1-6.
Concern: Real CLI/API runners have async boundaries, process/network jitter, and ordering surprises. Synchronous `runner.emit()` can make race conditions invisible.

3. Assumption: “send first” is a correctness guard, not a blind spot.
Reference: `Key Test Pattern: Send First`, `Definition of Done` bullet requiring triggerSend for event-flow tests.
Concern: The plan institutionalizes one precondition path and avoids asserting behavior when events arrive out of order. You are documenting a no-op contract instead of proving resilience.

4. Assumption: mode-switching correctness is equivalent to class-type return.
Reference: `Overview` item 2, `Phase 4` tests (instance type checks), `Use Cases` 7.
Concern: Returning `AgentRunner` vs `AgentApiRunner` does not prove correct configuration, isolation, or cleanup. It proves only constructor selection.

5. Assumption: settings-level API key bypass guarantees stateless behavior.
Reference: `Overview` item 2, `Phase 4` note on settings-level `apiKey`, `Risks & Mitigations` row on `resolveShellEnv` cache.
Concern: This skirts one cache path, but does not prove there is no cross-call memoization elsewhere in factory/provider wiring.

6. Assumption: JSDOM + prototype polyfill is “close enough” to Obsidian DOM.
Reference: `Obsidian DOM Polyfill`, `Phase 2` known differences comment.
Concern: You are validating against a synthetic DOM contract you define yourself. A wrong polyfill can make bad UI logic pass consistently.

7. Assumption: no open questions means no discovery risk.
Reference: `Open Questions: None`, `Deferred` list, P1 backlog.
Concern: The document has unresolved behavior choices (event ordering, disposal guarantees, context payload edge cases) but labels them as settled.

## 2) Scope risks

1. Unit setup scope is understated; it introduces a second test runtime contract.
Reference: `Phase 1` (new `vitest.unit.config.ts`, scripts, Makefile wiring), `Definition of Done` (`make test-all` integration).
Risk: New config drift with existing vitest integration setup can create split-brain behavior and CI-only failures.

2. Global `HTMLElement.prototype` mutation can leak across test files.
Reference: `Phase 2` (`Object.defineProperties(HTMLElement.prototype, ...)`), `Definition of Done` requiring global setup.
Risk: Cross-test pollution and load-order dependence can produce flaky tests that are hard to debug.

3. `triggerSend()` timing is under-specified.
Reference: `Key Test Pattern: Send First` (`setTimeout(0)` flush), `Phase 3` all event tests depend on it.
Risk: Macro/microtask assumptions in Vitest/JSDOM are unstable; this can intermittently fail or mask pending promises.

4. Context payload testing is P1 even though it touches execution semantics.
Reference: `P1: Context payload tests`, `Use Cases` and `Phase 3` rely on `runner.run(messages, context)`.
Risk: Critical prompt-context regressions can ship because the core payload contract is optional scope.

5. Destroy/recreate lifecycle test is too narrow for the claimed lifecycle guarantee.
Reference: `Overview` item 3, `Phase 3` lifecycle test.
Risk: One destroy/recreate pass on same container does not cover listener leaks, duplicate handlers, or multiple sequential recreations.

6. Hidden dependency on undocumented `CLAUDE.md` structure.
Reference: `Definition of Done` and `Documentation` requiring `CLAUDE.md` update.
Risk: Non-code docs dependency can block “done” late if file conventions are inconsistent or owned by another process.

## 3) Design weaknesses

1. The polyfill duplicates framework behavior with no fidelity checks.
Reference: `Obsidian DOM Polyfill` method table, `Phase 2` implementation.
Weakness: The sprint treats the shim as truth without contract tests against real Obsidian behavior. This is architectural self-deception.

2. Tests are overly coupled to `data-testid` and CSS class internals.
Reference: `Phase 3` assertions on selectors/classes (`ai-sidebar-fileop-card--pending`, `--err`, specific testids).
Weakness: Harmless DOM refactors will break tests, encouraging brittle snapshots over behavior-focused assertions.

3. Runner-agnostic claim is weakly proven.
Reference: `Use Cases` 2 and 8, `Phase 3` CLI/API equivalence tests using identical `MockRunner` shape.
Weakness: “CLI-style” and “API-style” are labels, not distinct contracts. This cannot expose divergence in event semantics between real implementations.

4. Factory statelessness is asserted, not stressed.
Reference: `Phase 4` “factory is stateless” note, 4 sequence tests.
Weakness: There is no repeated-call stress, no interleaving across agents, and no assertion around residual state after exceptions.

5. Rollback story ignores behavioral lock-in.
Reference: `Observability & Rollback` (“zero risk to production behavior; delete new files to revert”).
Weakness: Even test-only commits change team behavior and gate merges. A brittle suite is operational risk even without runtime changes.

## 4) Definition of Done gaps

1. No DoD requirement for negative ordering/pathological event sequences.
Reference: `Definition of Done` event-flow bullet enforces `triggerSend()` before emits.
Gap: A bad implementation that crashes or corrupts state on early/late events can still pass.

2. No DoD for listener disposal verification.
Reference: `Phase 3` destroy/recreate test, `Definition of Done` lifecycle bullet.
Gap: Tests do not require proving old runner listeners are removed after `destroy()`.

3. No DoD for duplicate send suppression or re-entrancy.
Reference: `Phase 3` send-flow tests mention single run call and disabled button while pending.
Gap: Missing rapid-click / Enter-spam coverage allows duplicate submission regressions.

4. No DoD for deterministic async behavior.
Reference: `Phase 3` depends on `setTimeout(0)`, `Definition of Done` checks only pass/fail once.
Gap: Single-run green does not prove stability; flakiness can pass unnoticed.

5. No DoD asserting meaningful mode-switch side effects beyond type.
Reference: `Definition of Done` mode-switch bullets, `Phase 4` sequence tests.
Gap: Miswired credentials, stale state reuse, or partial initialization can pass as long as instance type matches.

6. No DoD for failure observability quality.
Reference: `Error tests` require error card presence/message only.
Gap: Tests can pass even if user-facing recovery state is broken (input focus, retry affordance, status reset).

7. No DoD for performance or test-runtime budget.
Reference: `Definition of Done` omits timing bounds despite global polyfill and new suite.
Gap: Slow, noisy tests can be “done” while degrading developer velocity.

## 5) Most likely way this sprint fails

Most likely failure: **the suite goes green while missing real-world runner timing/state bugs, then starts flaking in CI and is treated as “just tests” noise.**

Reference chain:
1. `MockRunner` and manual `emit()` model (`MockRunner`, `Phase 3`) eliminate realistic async sequencing.
2. `triggerSend()` precondition is mandatory (`Key Test Pattern`, DoD), so out-of-order event behavior remains untested.
3. Mode switching asserts type only (`Phase 4`, DoD), so deeper lifecycle/config errors remain invisible.
4. Rollback framing minimizes risk because there are no production edits (`Overview`, `Observability & Rollback`), lowering urgency to harden weak tests.

Expected failure pattern:
1. Tests pass locally with deterministic emits and `setTimeout(0)` flushes.
2. CI intermittently fails due to event-loop/order sensitivity and global prototype side effects.
3. Team quarantines or retries tests instead of fixing root causes.
4. Sprint is marked complete, but regression coverage for `AgentChatTab` and mode-switch lifecycle is still unreliable.
