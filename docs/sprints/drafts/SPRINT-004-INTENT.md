# Sprint 004 Intent: E2E Test Suite (Obsidian UI Automation)

## Seed

> Let's create some E2E (End-to-End) testing for this plugin, I would like the tests to create a new vault, install the plugin, then actually open Obsidian and do testing through the user interface by enabling the plugin and using its different options. Let's keep this separate from the unit and integration testing and call it something like "make test-e2e"

## Context

### Orientation Summary

- **Three completed sprints**: Sprint 001 delivered the core plugin (CLI runners, file-op protocol, sidebar UI); Sprint 002 added API access mode and provider-centric settings; Sprint 003 added a full Node-based integration test suite exercising streaming parsers, path guards, and runner selection — all without Obsidian runtime.
- **E2E is a new tier**: Existing tests are either pure-Node unit/integration tests. No test today actually launches Obsidian or exercises the plugin through a real UI. This sprint closes that gap.
- **Electron + Playwright**: Obsidian is an Electron app. Playwright has first-class Electron support via `electron.launch()`. This is the standard approach for Electron app E2E testing.
- **Existing vault infrastructure**: `make vault-setup` already creates `vault/` with the plugin installed and sample notes. E2E can build on this pattern to create a fresh test vault per run.
- **Desktop-only**: `isDesktopOnly: true` is set in `manifest.json`. Tests run only on macOS/Linux/Windows desktop where Obsidian is installed.

## Recent Sprint Context

- **Sprint 001**: Core plugin — CLI runners, `:::file-op` protocol, tab-based sidebar, settings with agent detection
- **Sprint 002**: Provider-centric settings, `AgentApiRunner` with Anthropic/OpenAI/Google SDKs, runner factory, shell env API key detection
- **Sprint 003**: Full Node integration test suite — chunk-boundary streaming tests, path traversal guard tests, runner factory selection, AgentDetector cache, shellEnv fallback — all in `tests/integration/` with `vitest.integration.config.ts`

## Relevant Codebase Areas

| Area | Relevance |
|------|-----------|
| `Makefile` | `vault-setup` target: model for E2E vault creation; `test-e2e` target to add |
| `manifest.json` | Plugin ID (`ai-agent-sidebar`), version |
| `src/main.ts` | Plugin entry point — what E2E tests verify loads |
| `src/settings.ts` | Settings UI — provider sections, enable/disable toggles, access mode |
| `src/AgentSidebarView.ts` | Sidebar view — tabs, chat UI |
| `src/AgentChatTab.ts` | Chat tab — message input, streaming display |
| `vault/` | Existing dev vault structure to model E2E vault setup after |
| `vitest.integration.config.ts` | Pattern to follow for a separate `vitest.e2e.config.ts` |
| `package.json` | Scripts pattern; need `"test-e2e"` script |

## Constraints

- Must follow project conventions in CLAUDE.md (Conventional Commits, no over-engineering)
- Must integrate alongside existing test tiers — `npm test` (unit) and `npm run test-integration` (integration) must continue to pass unaffected
- E2E tests run via `make test-e2e` / `npm run test-e2e` — separate command, separate config
- Tests must require Obsidian to be installed on the machine; they should **skip gracefully** (not crash) if Obsidian is not found
- Tests must be deterministic: each test starts from a clean vault; no shared mutable state between tests
- Plugin must be built (`main.js`) before E2E tests run; tests should enforce this
- No real API keys or real CLI agents required for E2E tests — settings UI tests can verify toggles without actually sending messages
- Avoid testing Obsidian's own behavior; test only our plugin's UI surface

## Success Criteria

A successful sprint delivers:
1. `make test-e2e` command that: builds the plugin, creates a fresh test vault, launches Obsidian via Playwright/Electron, enables the plugin, exercises key UI surfaces, and exits cleanly
2. At least the following test scenarios pass:
   - Plugin enables in Obsidian without errors (loads, no error modal)
   - Sidebar opens via ribbon icon or command palette
   - Settings page opens and displays provider sections
   - At least one provider enable toggle can be clicked
   - Sidebar displays "no agents enabled" state when none are enabled
3. Tests skip gracefully when Obsidian is not installed (CI-safe)
4. Clean vault teardown after each test run (no leftover temp directories)

## Verification Strategy

- **Reference behavior**: The plugin's own UI is the spec. E2E tests verify what a user would see and do.
- **Spec/documentation**: Sprint 001's Verification Matrix and Definition of Done describe expected UI behaviors.
- **Edge cases to handle**:
  - Obsidian not installed → skip with a clear message
  - First launch (no `obsidian.json` exists) → tests must handle Obsidian's first-run UI or vault picker
  - Plugin not built → fail with clear error message
  - Plugin load error → test should surface the error rather than hanging
- **Testing approach**: Playwright `electron.launch()` targeting the Obsidian binary; Playwright's `page` API for UI interaction; screenshot capture on failure

## Uncertainty Assessment

- **Correctness uncertainty: High** — E2E tests of Electron apps depend heavily on selector stability; Obsidian's DOM is not documented as a stable API. Selectors may break across Obsidian versions.
- **Scope uncertainty: Medium** — The seed is clear about the goal (real Obsidian UI testing), but the extent of what's testable (settings interaction, actual agent chat) needs clarification from the planner.
- **Architecture uncertainty: High** — Several key decisions have no established precedent in this codebase: finding the Obsidian binary, launching with a specific vault, bypassing first-run UI, enabling the plugin programmatically vs. through the UI.

## Open Questions

1. **Obsidian binary location**: Where should the test look for the Obsidian binary? System PATH, hardcoded platform-specific paths (e.g., `/Applications/Obsidian.app` on macOS), or a configurable environment variable `OBSIDIAN_PATH`?

2. **First-run vault picker**: Obsidian shows a vault picker on first launch. Should E2E tests: (a) pre-configure `obsidian.json` to point at the test vault, (b) use `--vault <path>` CLI flag if Obsidian supports it, or (c) automate clicking through the vault picker UI?

3. **Plugin enable mechanism**: The plugin needs to be enabled in settings before it shows in the UI. Should tests: (a) pre-populate `community-plugins.json` (as `make vault-setup` currently does), or (b) actually click through the Obsidian Settings → Community Plugins UI to enable it?

4. **Test depth**: The seed asks for "testing through the user interface by enabling the plugin and using its different options." How deep should the first sprint go? Options:
   - **Shallow**: Just verify the plugin loads, sidebar opens, settings open (no agent interaction)
   - **Medium**: Also verify settings UI state (provider sections visible, toggles work)
   - **Deep**: Also send a message and verify UI response (requires real agent or mock)

5. **CI feasibility**: Should `make test-e2e` be expected to run in CI (GitHub Actions), or is this a local-only developer test? Running Obsidian in headless CI requires a virtual display (Xvfb on Linux).

6. **Playwright vs. alternative**: Are there strong opinions on Playwright for Electron vs. other approaches (e.g., direct WebSocket to Electron DevTools Protocol, or a headless Chromium approach)?
