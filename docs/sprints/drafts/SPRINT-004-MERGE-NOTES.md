# Sprint 004 Merge Notes

## Claude Draft Strengths
- Clear scope: plugin load + sidebar open + settings UI, no agent interaction
- Good `data-testid` strategy for selector stability (plugin-owned DOM attributes)
- Solid vault factory design (mkdtemp, copy artifacts, cleanup)
- Per-fixture vault creation pattern is correct
- Good binary discovery with env var + platform defaults + graceful skip

## Codex Draft Strengths
- Correctly sticks to Vitest as the runner (repo consistency: `vitest.e2e.config.ts`, not Playwright test runner)
- Centralized `selectors.ts` helper is a good addition
- Correctly noted that `electron.launch({ args: [vaultPath] })` (positional) may work without the `--vault` flag
- Cleaner phase structure (5 phases vs 5 in Claude draft)
- Better skip mechanism: fixture-level `test.skip()` rather than sentinel file
- Identified the `PLUGIN_ID` manifest mismatch: manifest uses `ai-agent-sidebar` but Makefile variable uses `obsidian-ai-agent-sidebar` — vault factory must use `ai-agent-sidebar` as the plugin folder name

## Valid Critiques Accepted

1. **Use Vitest + Playwright API (not Playwright test runner)**: Repo uses Vitest throughout; adding a third harness (`playwright test`) increases complexity without benefit. Use `vitest.e2e.config.ts` with `playwright` package's Electron API called directly from Vitest tests. ✓

2. **Command strings were wrong**: Command name is `"Open sidebar"` (not "Open AI Agent Sidebar"); ribbon tooltip is `"Open AI agent sidebar"` (lowercase). Updated in final sprint. ✓

3. **Remove global Obsidian config fallback**: Modifying `~/.config/obsidian/obsidian.json` is too risky. If `--vault` arg fails on a platform, skip with clear message instead. ✓

4. **Empty state in `AgentSidebarView.ts`**: `renderEmptyState()` lives in `AgentSidebarView.ts` (line 129), not `AgentChatTab.ts`. File reference corrected. ✓

5. **Linux binary path**: `~/.local/share/applications/obsidian` is a `.desktop` entry, not an executable. Use `which obsidian` or known AppImage locations instead. ✓

6. **Fixture-level `test.skip()`**: Cleaner and more reliable than sentinel file approach for skip behavior. ✓

7. **Electron version pinning not applicable**: Electron is embedded in Obsidian, not an npm dep. Record tested Obsidian version range instead. ✓

8. **Minimal `data-testid` scope**: Only add attributes that are actually used by E2E tests in this sprint. Remove `AgentChatTab.ts` instrumentation from scope. ✓

## Critiques Rejected (with reasoning)

- **"Don't add data-testid"**: Codex left this as an open question. We keep `data-testid` attributes in plugin source — they're the most stable selector strategy available and are fully within our control. Minimal scope: sidebar root, empty state, provider sections, enable toggles. Low risk, high stability value.

## Interview Refinements Applied
- Binary: Env var first (`OBSIDIAN_BINARY`), then platform defaults, skip gracefully if not found
- Depth: Shallow — plugin load + sidebar + settings only; no agent interaction
- Vault: `--vault` CLI flag first; skip if unsupported (no global config modification)
- CI: Local developer only; skip gracefully when Obsidian not installed

## Final Decisions
- **Runner**: Vitest with Playwright's Electron API (`playwright` package, not `@playwright/test` runner)
- **Config**: `vitest.e2e.config.ts` following the same pattern as `vitest.integration.config.ts`
- **Layout**: `tests/e2e/` directory with `helpers/` subdirectory; no `fixtures/` layer needed (simpler)
- **Skip mechanism**: `findObsidianBinary()` called in a shared setup; each test uses `const binary = findObsidianBinary(); if (!binary) { ctx.skip(); }` or a shared `beforeAll` that skips the suite
- **data-testid attributes**: Added to `AgentSidebarView.ts` and `settings.ts` only
- **Plugin folder name**: `ai-agent-sidebar` (from `manifest.json` id), NOT `obsidian-ai-agent-sidebar`
