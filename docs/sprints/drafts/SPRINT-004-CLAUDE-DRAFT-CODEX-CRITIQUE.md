# Sprint 004 Claude Draft Critique (by Codex)

## Summary
Claude's draft has solid scope control and the right top-level goal (real Obsidian UI automation with temp vault isolation). The biggest gaps are around runner/tooling coherence, a few selector/file mismatches against current source, and one unsafe fallback strategy that should be removed.

## What Claude Draft Does Well
- Keeps E2E focused on plugin load + sidebar/settings flows, not agent network/CLI execution.
- Uses per-run temp vault creation and teardown.
- Calls out skip behavior when Obsidian is unavailable.
- Proposes stable selector strategy via plugin-owned attributes.

## Critical Issues

1. Test framework split is under-justified and increases maintenance cost.
- Draft introduces Playwright test runner (`playwright test`) while repo already standardizes on Vitest (`test`, `test-integration`).
- This creates a third test harness style (Vitest unit + Vitest integration + Playwright runner), plus separate setup/teardown patterns.
- Recommendation: either keep a single Vitest-based E2E command using Playwright's Electron API, or explicitly justify why a separate Playwright runner is required.

2. Command/label selectors in scenarios do not match current plugin strings.
- `main.ts` defines command name `Open sidebar` (not `Open AI Agent Sidebar`).
- Ribbon tooltip is `Open AI agent sidebar` (lowercase `agent`).
- Recommendation: align planned selectors and command-palette steps with exact current strings, or explicitly require test IDs for these actions.

3. Unsafe fallback proposes writing to user's global Obsidian config.
- Draft suggests modifying `~/.config/obsidian/obsidian.json` if `--vault` fails.
- This is high-risk for local dev environments and violates isolation expectations of automated tests.
- Recommendation: do not mutate user-global Obsidian config. If direct vault argument is unreliable, mark platform unsupported and skip with explicit reason.

4. File-level plan has a concrete mismatch: empty state is not in `AgentChatTab`.
- Draft says add empty-state test id in `src/AgentChatTab.ts`, but empty state is rendered in `AgentSidebarView.renderEmptyState()`.
- Recommendation: move empty-state instrumentation plan to `src/AgentSidebarView.ts` only.

## Medium Priority Gaps

1. Linux binary path assumption is likely incorrect.
- `~/.local/share/applications/obsidian` is typically a desktop entry, not executable binary.
- Recommendation: prioritize `OBSIDIAN_BINARY`/`OBSIDIAN_PATH`, `which obsidian`, and known executable locations; validate executable bit.

2. Skip mechanism is underspecified for Playwright global setup.
- "Write sentinel and exit 0" in global setup does not automatically skip tests unless test files consume that state consistently.
- Recommendation: define one deterministic skip mechanism end-to-end (fixture-level `test.skip(...)` or suite gating helper).

3. Data-testid rollout scope is broader than needed.
- Draft includes `src/AgentChatTab.ts` test IDs and many plugin-level attributes in first pass.
- Recommendation: start with minimum required hooks (`sidebar root`, `empty state`, provider card/toggle containers) to keep sprint focused.

4. Electron version pinning is not actionable in this architecture.
- Draft risk mitigation says "pin Electron and Playwright versions," but Electron is provided by installed Obsidian app, not an npm dependency.
- Recommendation: replace with "pin Playwright version and record tested Obsidian app versions."

## Suggested Edits to Claude Draft
1. Pick one runner strategy and document rationale clearly (`vitest + playwright` API vs Playwright test runner).
2. Correct command/ribbon strings to match current source (`Open sidebar`, `Open AI agent sidebar`).
3. Remove any plan step that edits user-global Obsidian config; skip unsupported launch cases instead.
4. Fix file references for empty-state instrumentation (`AgentSidebarView`, not `AgentChatTab`).
5. Tighten binary discovery paths and require executable-path validation.
6. Make skip behavior explicit and test-file enforceable.

## Verdict
Directionally strong and close to implementation-ready, but not fully safe/executable as written due to the global-config fallback, selector mismatches, and a few source-structure inaccuracies.
