# Sprint 004 Devil's Advocate Review

## Scope of this review
This document intentionally challenges `docs/sprints/SPRINT-004.md` before implementation. The goal is to identify where this sprint can report success while still delivering fragile or misleading E2E coverage.

## 1) Flawed assumptions

1. Assumption: skipping when Obsidian is missing is an acceptable green signal.
Reference: `Use Cases` #7, `Definition of Done` (exit 0 on skip), `Verification Matrix` first row.
Concern: This normalizes "no test execution" as success. In environments without Obsidian, the suite gives false confidence and can silently rot for weeks.

2. Assumption: Obsidian selectors are "stable" enough for E2E reliability.
Reference: `Selector Strategy` (Obsidian structural selectors "changed rarely").
Concern: This is wishful thinking. Obsidian is not your DOM contract. One label or command text tweak breaks tests unrelated to plugin behavior.

3. Assumption: a 60s timeout and serial execution imply reliability.
Reference: `Overview` ("reliable, fast (~60 second)"), `Phase 1` (`testTimeout: 60_000`, `fileParallelism: false`).
Concern: Serial + long timeout can hide startup regressions and race conditions, not solve them. Slow/hanging tests can still pass intermittently and burn CI time.

4. Assumption: plugin-load failure can be detected by modal text matching.
Reference: `plugin-load.e2e.test.ts` task (match `/ai.?agent.?sidebar|error loading/i` in `.modal-bg`).
Concern: This is brittle and incomplete. Load failures can surface in logs, notifications, or silent deactivation with no matching modal text.

5. Assumption: pinning `playwright` is enough to manage Electron compatibility.
Reference: `Risks & Mitigations` (`playwright` incompatibility mitigated by pinning + comment documenting tested Obsidian version).
Concern: A pinned dependency and a code comment are not compatibility management. Obsidian auto-updates independently and can invalidate the harness overnight.

## 2) Scope risks

1. The "shallow" scope already includes significant host-app orchestration complexity.
Reference: `Overview` (deliberately shallow), `Obsidian Launch` (vault picker retry, trust modal handling), `Open Questions` (restricted mode prompt).
Risk: You are building a mini Obsidian startup controller. Handling first-run states across OS/version combinations is larger than this plan admits.

2. Binary discovery is underestimated across Linux/Windows installs.
Reference: `Binary Discovery` section and `obsidianBinary.ts` tasks.
Risk: Linux AppImage/snap/flatpak and Windows install-path variation will cause frequent "not found" states or invalid executable checks. Skip logic masks coverage loss instead of fixing discovery.

3. Data-testid rollout can balloon into refactors if current UI construction does not expose stable element handles.
Reference: `Phase 3` (`AgentSidebarView.ts`, `settings.ts` data-testid additions).
Risk: If toggle controls are wrapped by Obsidian components, attaching deterministic IDs to the actually interactive node may require deeper UI restructuring.

4. Artifact handling is under-scoped.
Reference: `Phase 5` failure screenshots and `.gitignore` update.
Risk: No retention policy, naming collision strategy, or per-test directory structure. Debug artifacts can become noisy/unusable fast.

5. Hidden dependency on local built assets introduces brittle preconditions.
Reference: `Vault Setup` (`main.js` copied from project root), `Dependencies` (`build` required first).
Risk: Any build pipeline change (output path, bundling format, CSS emission) breaks vault seeding. This couples E2E harness to packaging details.

## 3) Design weaknesses

1. The architecture overfits to DOM-level behavior and underfits to plugin lifecycle invariants.
Reference: `Architecture`, `Selector Strategy`, test file tasks.
Weakness: Tests assert visibility and text, but do not verify plugin registration state, command wiring integrity, or view lifecycle cleanup.

2. Retry-on-vault-picker then skip is an anti-diagnostic control flow.
Reference: `Obsidian Launch` (retry with `--vault`, then skip).
Weakness: On actual launch regressions, this avoids hard failure and erases signal instead of exposing root cause.

3. "Auto-dismiss trust modal" is a fragile heuristic.
Reference: `Obsidian Launch` startup handling.
Weakness: Modal text/UI can vary by version/platform/localization. Heuristic click-through can target wrong controls and create flaky, non-deterministic startup behavior.

4. Selector centralization does not solve selector volatility.
Reference: `Selector Strategy` and `helpers/selectors.ts`.
Weakness: Centralization lowers edit cost but does not reduce break frequency. It is a maintainability pattern, not a stability strategy.

5. Toggle interaction assertions are too weak for behavior validation.
Reference: `settings-ui.e2e.test.ts` task ("at least one toggle present and interactive").
Weakness: A CSS class change can satisfy "state changed" while underlying persisted settings remain broken.

## 4) Definition of Done gaps

1. No requirement that E2E tests must execute in at least one CI environment.
Reference: `Definition of Done` skip criteria and pass criteria.
Gap: A permanent skip still satisfies DoD on machines without Obsidian.

2. No assertion that plugin enablement actually succeeds in Obsidian's internal state.
Reference: DoD plugin load criteria rely on absence of error modal.
Gap: "No visible error" is not equivalent to "plugin enabled and running."

3. No persistence verification for settings toggle behavior.
Reference: DoD toggle criterion (present and interactive).
Gap: There is no reopen/reload verification that toggle changes are written and rehydrated.

4. No cross-platform acceptance bar.
Reference: `Binary Discovery`, `Risks & Mitigations` discuss platform variance; DoD does not require platform coverage.
Gap: A macOS-only green run can ship Linux/Windows-broken E2E harnesses.

5. No flake budget or repeatability gate.
Reference: `Overview` reliability target, DoD lacks stability metrics.
Gap: Suite can pass once while being statistically unstable.

6. No requirement to fail loudly on harness regressions.
Reference: `Use Cases` #7 and DoD skip behavior.
Gap: Harness-level defects (binary detection, launch args, modal handling) can degrade into skips instead of hard failures.

## 5) Most likely way this sprint fails

Most likely failure: **the suite becomes "green but non-executing" or "green but low-signal."**

Why this is likely:
1. The plan explicitly treats skip as success when Obsidian cannot be launched (`Use Cases` #7, DoD skip item).
2. Launch complexity is front-loaded into heuristics (vault arg fallback, trust/restricted prompts) that tend to drift with app updates (`Obsidian Launch`, `Open Questions`).
3. Test assertions are largely UI-surface checks, not durable behavior checks (`Phase 4` tasks, DoD toggle and modal criteria).

Failure pattern to expect:
1. Initial implementation passes on one developer machine.
2. Obsidian update or OS variance causes discovery/launch friction.
3. Runs increasingly skip or intermittently pass with weak assertions.
4. Team stops trusting E2E results, but DoD remains technically satisfied.
