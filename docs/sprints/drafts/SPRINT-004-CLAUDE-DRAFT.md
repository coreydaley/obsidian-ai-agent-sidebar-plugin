# Sprint 004: E2E Test Suite (Obsidian UI Automation)

## Overview

Sprints 001–003 delivered a fully-functional plugin and a comprehensive Node-based test suite. What's missing is a test that actually runs the product the way a user does: opening Obsidian, enabling the plugin, and interacting with the sidebar. This sprint creates that top-layer validation.

The approach uses **Playwright's Electron integration** (`@playwright/test` + `electron` launch API) to drive the real Obsidian application against a dedicated test vault. Each test run creates a fresh vault in `os.tmpdir()`, builds and installs the plugin into it, launches Obsidian pointing at that vault, runs the test scenarios, and tears down the temp directory. The test command is `make test-e2e` / `npm run test-e2e`, fully independent of the existing unit and integration suites.

The first sprint keeps scope tightly bounded: verify the plugin loads, the sidebar opens, and the settings UI renders correctly. Agent interaction (sending messages, streaming responses) is explicitly deferred — it would require real CLI agents or API keys and dramatically increases test complexity. The goal is a reliable, fast (~30 second), skippable-on-no-Obsidian suite that proves the plugin installs and shows up correctly.

## Use Cases

1. **Plugin load verification**: After installation, Obsidian loads the plugin without an error modal or console errors.
2. **Sidebar open**: The ribbon icon or command palette opens the AI Agent Sidebar panel.
3. **Settings UI**: The settings page shows the four provider sections (Anthropic, OpenAI, Google, GitHub).
4. **Empty state**: When no providers are enabled, the sidebar displays the "No agents enabled" message.
5. **Enable toggle**: Clicking an enable toggle in settings (when a provider is detected) changes its state.
6. **Graceful skip**: When Obsidian is not installed, `make test-e2e` exits with a clear skip message, not an error.

## Architecture

```
tests/e2e/
├── helpers/
│   ├── obsidianBinary.ts     Find Obsidian binary on platform (macOS/Linux/Windows)
│   ├── vaultFactory.ts       Create + populate temp vault; install plugin; cleanup
│   └── electronLauncher.ts   Launch Obsidian via Playwright electron.launch(); manage lifecycle
├── fixtures/
│   └── baseFixtures.ts       Playwright fixtures: app, page, vaultPath
├── plugin-load.e2e.test.ts   Plugin enables without errors
├── sidebar-open.e2e.test.ts  Ribbon/command palette opens sidebar
└── settings-ui.e2e.test.ts   Settings page: provider sections, toggles

playwright.e2e.config.ts      Playwright config: Electron mode, 60s timeout, screenshot-on-fail
tests/e2e/global-setup.ts     Global setup: verify Obsidian binary exists; build plugin if needed
tests/e2e/global-teardown.ts  Global teardown: final cleanup
```

### Binary Discovery

Obsidian is found by:
1. Checking `OBSIDIAN_BINARY` env var (highest priority — user override, CI support)
2. Checking known platform-specific locations:
   - macOS: `/Applications/Obsidian.app/Contents/MacOS/Obsidian`
   - Linux: `~/.local/share/applications/obsidian` AppImage, or `which obsidian`
   - Windows: `%LOCALAPPDATA%\Obsidian\Obsidian.exe`
3. If not found: log a clear message and exit with code 0 (skip, not fail)

### Vault Setup

```
<tmpdir>/obsidian-e2e-<timestamp>/
└── vault/
    ├── .obsidian/
    │   ├── app.json              { "vaultName": "e2e-test-vault" }
    │   ├── community-plugins.json  ["ai-agent-sidebar"]
    │   └── plugins/
    │       └── ai-agent-sidebar/
    │           ├── main.js       (copied from project build output)
    │           ├── manifest.json
    │           └── styles.css
    └── Welcome.md                (sample note)
```

No `safe-mode.json` is written — community plugins are pre-enabled via `community-plugins.json`. The vault is opened by passing its path to Obsidian via `--vault <path>` CLI argument (Obsidian supports this undocumented flag on macOS/Linux).

If `--vault` is not supported on the current platform, fall back to pre-configuring `~/.config/obsidian/obsidian.json` (or platform equivalent) to add the vault. However, modifying user's global Obsidian config is a last resort and must be reverted after the test.

### Playwright Electron Launch

```typescript
const app = await electron.launch({
  executablePath: obsidianBinary,
  args: ['--vault', vaultPath, '--disable-gpu', '--no-sandbox'],
  env: { ...process.env, OBSIDIAN_OPEN_DEVTOOLS: '0' }
});
const window = await app.firstWindow();
await window.waitForLoadState('domcontentloaded');
```

Tests interact with Obsidian's DOM via Playwright selectors. Key selectors are abstracted into page-object helpers so if the DOM changes, only the helper needs updating.

### Selector Strategy

Obsidian's DOM is not a stable API. Strategy for stability:
- Prefer `data-` attributes and `aria-label` over class names
- Use Obsidian's known structural selectors (ribbon container, plugin settings sections, sidebar panes) which change rarely
- Add `data-testid` attributes to our plugin's DOM where possible — this is fully within our control and makes selectors stable

Our plugin DOM additions (`data-testid`):
- `data-testid="ai-agent-sidebar"` on the sidebar root element
- `data-testid="ai-agent-settings-section-<providerId>"` on each provider section
- `data-testid="ai-agent-enable-toggle-<agentId>"` on each enable toggle
- `data-testid="ai-agent-empty-state"` on the empty-state message

These attributes are non-functional and are added to plugin source as part of this sprint.

## Implementation Plan

### Phase 1: Build Infrastructure (~15%)

**Files:**
- `package.json` — add `"test-e2e"` script, add `@playwright/test` devDependency
- `Makefile` — add `test-e2e` target, add to `.PHONY`
- `playwright.e2e.config.ts` — new Playwright config
- `tests/e2e/global-setup.ts` — binary check + build verification
- `tests/e2e/global-teardown.ts` — cleanup

**Tasks:**
- [ ] Install `@playwright/test` as devDependency (pinned exact version)
- [ ] Add `"test-e2e": "playwright test --config playwright.e2e.config.ts"` to `package.json` scripts
- [ ] Add `test-e2e` to Makefile: `make build && npm run test-e2e`
- [ ] Create `playwright.e2e.config.ts`:
  - `use: { screenshot: 'only-on-failure', video: 'retain-on-failure' }`
  - `timeout: 60_000`, `workers: 1` (serial, Obsidian is single-instance)
  - `globalSetup: './tests/e2e/global-setup.ts'`
  - `globalTeardown: './tests/e2e/global-teardown.ts'`
- [ ] `global-setup.ts`: check for `main.js` (abort with clear error if missing); call `findObsidianBinary()` and store result in a temp file for test access; if binary not found, write a skip sentinel file and exit 0
- [ ] `global-teardown.ts`: clean up any leftover temp vault directories

### Phase 2: Helpers (~20%)

**Files:**
- `tests/e2e/helpers/obsidianBinary.ts`
- `tests/e2e/helpers/vaultFactory.ts`
- `tests/e2e/helpers/electronLauncher.ts`

**Tasks:**
- [ ] `obsidianBinary.ts`:
  - Export `findObsidianBinary(): string | null`
  - Check `OBSIDIAN_BINARY` env var first
  - Platform-specific default paths (macOS, Linux, Windows)
  - `which obsidian` fallback
  - Return `null` if not found
- [ ] `vaultFactory.ts`:
  - Export `createTestVault(): Promise<{ vaultPath: string; cleanup: () => Promise<void> }>`
  - Uses `fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-e2e-'))` for unique dir
  - Writes `.obsidian/community-plugins.json`, `.obsidian/app.json`
  - Copies `main.js`, `manifest.json`, `styles.css` from project root to plugin dir
  - Creates a `Welcome.md` file in vault root
  - `cleanup()` calls `fs.rm(vaultPath, { recursive: true, force: true })`
- [ ] `electronLauncher.ts`:
  - Export `launchObsidian(binaryPath: string, vaultPath: string): Promise<{ app: ElectronApplication; page: Page }>`
  - Launches via `electron.launch()` with `--vault` arg
  - Waits for first window and `domcontentloaded`
  - Handles first-run Obsidian dialogs (vault picker, trust plugin modal) automatically:
    - If vault picker appears: click the vault or "Open folder as vault"
    - If "Trust this plugin" modal appears: click "Trust and enable"
  - Export `quitObsidian(app: ElectronApplication): Promise<void>`

### Phase 3: Playwright Fixtures (~10%)

**Files:**
- `tests/e2e/fixtures/baseFixtures.ts`

**Tasks:**
- [ ] Define `E2EFixtures` extending Playwright `test` fixtures:
  ```typescript
  const test = base.extend<{
    vaultPath: string;
    app: ElectronApplication;
    page: Page;
  }>({
    vaultPath: async ({}, use) => {
      const { vaultPath, cleanup } = await createTestVault();
      await use(vaultPath);
      await cleanup();
    },
    app: async ({ vaultPath }, use) => {
      const binary = findObsidianBinary();
      if (!binary) { test.skip(); return; }
      const { app, page: _ } = await launchObsidian(binary, vaultPath);
      await use(app);
      await quitObsidian(app);
    },
    page: async ({ app }, use) => {
      const page = await app.firstWindow();
      await use(page);
    },
  });
  export { test, expect };
  ```
- [ ] Export `test` and `expect` from fixtures file — all E2E tests import from here

### Phase 4: Plugin DOM Attributes (~10%)

**Files:**
- `src/AgentSidebarView.ts` — add `data-testid` to sidebar root
- `src/AgentChatTab.ts` — add `data-testid` to empty state
- `src/settings.ts` — add `data-testid` to provider sections and enable toggles

**Tasks:**
- [ ] Add `containerEl.setAttribute('data-testid', 'ai-agent-sidebar')` to `AgentSidebarView.onOpen()`
- [ ] Add `data-testid="ai-agent-empty-state"` to empty state element in `AgentSidebarView`
- [ ] Add `data-testid="ai-agent-settings-section-${provider.id}"` to each provider section container in `settings.ts`
- [ ] Add `data-testid="ai-agent-enable-toggle-${agent.id}"` to each enable toggle in `settings.ts`
- [ ] Run `npm run build` to verify no TypeScript errors introduced

### Phase 5: E2E Tests (~40%)

**Files:**
- `tests/e2e/plugin-load.e2e.test.ts`
- `tests/e2e/sidebar-open.e2e.test.ts`
- `tests/e2e/settings-ui.e2e.test.ts`

**Tasks:**

#### `plugin-load.e2e.test.ts`
- [ ] Test: Obsidian loads without error modal — `page.locator('.modal-title').filter({ hasText: /error/i })` should not be visible after 5s
- [ ] Test: Plugin is listed as enabled in community plugins data — read `community-plugins.json` from temp vault and verify `"ai-agent-sidebar"` is present
- [ ] Test: No JavaScript errors logged from plugin code — attach `page.on('console', ...)` listener; fail if any `error` messages match plugin module name

#### `sidebar-open.e2e.test.ts`
- [ ] Test: Ribbon icon opens sidebar — click `[aria-label="Open AI Agent Sidebar"]` ribbon button; verify `[data-testid="ai-agent-sidebar"]` becomes visible
- [ ] Test: Command palette opens sidebar — press `Ctrl+P` (or `Cmd+P` on macOS); type "Open AI Agent Sidebar"; press Enter; verify sidebar visible
- [ ] Test: Sidebar shows empty state when no agents enabled — verify `[data-testid="ai-agent-empty-state"]` is visible

#### `settings-ui.e2e.test.ts`
- [ ] Test: Settings page opens — click gear icon or use command palette; verify settings content area loads
- [ ] Test: Plugin settings section visible — open plugin settings; verify "AI Agent Sidebar" settings section present
- [ ] Test: Four provider sections rendered — verify `[data-testid="ai-agent-settings-section-anthropic"]`, `[data-testid="ai-agent-settings-section-openai"]`, `[data-testid="ai-agent-settings-section-google"]`, `[data-testid="ai-agent-settings-section-github"]` are all visible
- [ ] Test: Enable toggles are rendered — verify at least one `[data-testid^="ai-agent-enable-toggle-"]` is present

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add `test-e2e` script, add `@playwright/test` devDependency |
| `Makefile` | Modify | Add `test-e2e` target |
| `playwright.e2e.config.ts` | Create | Playwright Electron config: timeout, workers, screenshot/video |
| `tests/e2e/global-setup.ts` | Create | Binary check, build verification, skip sentinel |
| `tests/e2e/global-teardown.ts` | Create | Final cleanup |
| `tests/e2e/helpers/obsidianBinary.ts` | Create | Platform-specific Obsidian binary finder |
| `tests/e2e/helpers/vaultFactory.ts` | Create | Create/populate/cleanup temp test vault |
| `tests/e2e/helpers/electronLauncher.ts` | Create | Launch Obsidian via Playwright Electron; handle first-run dialogs |
| `tests/e2e/fixtures/baseFixtures.ts` | Create | Playwright fixtures: vaultPath, app, page |
| `src/AgentSidebarView.ts` | Modify | Add `data-testid` to sidebar root and empty state |
| `src/AgentChatTab.ts` | Modify | Add `data-testid` to chat UI elements |
| `src/settings.ts` | Modify | Add `data-testid` to provider sections and enable toggles |
| `tests/e2e/plugin-load.e2e.test.ts` | Create | Plugin load, no errors, community-plugins check |
| `tests/e2e/sidebar-open.e2e.test.ts` | Create | Ribbon open, command palette open, empty state |
| `tests/e2e/settings-ui.e2e.test.ts` | Create | Settings page, four provider sections, toggles |

## Definition of Done

- [ ] `make test-e2e` runs and all E2E tests pass on a machine with Obsidian installed
- [ ] `make test-e2e` exits with code 0 (not error) on a machine without Obsidian installed, with a clear "Obsidian not found — skipping E2E tests" message
- [ ] `npm test` (unit) and `make test-integration` (integration) continue to pass unaffected
- [ ] `npm run build` (tsc + esbuild) passes — no TypeScript errors from added `data-testid` attributes
- [ ] Plugin loads in Obsidian without error modal (verified by E2E test)
- [ ] Sidebar opens via ribbon icon (verified by E2E test)
- [ ] Settings page shows all four provider sections (verified by E2E test)
- [ ] Empty state message shown when no agents enabled (verified by E2E test)
- [ ] Each test creates a fresh vault in a temp directory (no shared state between tests)
- [ ] All temp vault directories are cleaned up after test completion (even on test failure)
- [ ] Playwright screenshots captured on test failure and saved to `tests/e2e/screenshots/`
- [ ] `data-testid` attributes added to: sidebar root, empty state, each provider section, each enable toggle
- [ ] `@playwright/test` added as pinned devDependency (no `^` or `~`)
- [ ] `tsconfig.json` updated if needed to include `playwright.e2e.config.ts` type checks
- [ ] `tests/e2e/` excluded from production `tsc` build (already excluded via `tsconfig.json` include pattern or explicit exclude)

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Obsidian first-run vault picker blocks test launch | High | High | Pre-configure vault in Obsidian's global config or handle vault picker UI via Playwright automation |
| Obsidian DOM selectors change across app versions | High | Medium | Use `data-testid` attributes in our plugin code; use stable Obsidian aria-labels for non-plugin elements |
| `--vault` CLI flag not supported on all platforms | Medium | Medium | Fallback to global config approach; document in README |
| Plugin trust modal blocks test after launch | High | High | Pre-configure `community-plugins.json` to pre-approve plugin; handle modal in launcher helper |
| Electron/Playwright version incompatibility | Medium | Medium | Pin both Playwright and Electron versions; verify compatibility matrix |
| Tests are flaky due to Obsidian startup timing | Medium | Medium | Use `waitForSelector` with generous timeouts (30s); never use `page.waitForTimeout` |
| CI environment has no Obsidian binary | High | Low | Skip behavior already designed; add CI note in README |
| Multiple Obsidian windows from previous test run | Low | Medium | `workers: 1` in Playwright config ensures serial execution; `quitObsidian()` closes app after each test |

## Security Considerations

- **Temp vault isolation**: Each test creates a unique temp directory; no real user vault data is touched
- **No API keys in E2E tests**: Tests exercise settings UI only (no agent invocation); no API keys injected
- **Binary path validation**: `findObsidianBinary()` must validate the resolved path is an absolute path to an executable; reject relative paths or paths outside expected locations
- **No shell injection**: Electron launch args are passed as an array, never constructed as shell strings
- **Screenshot data**: Playwright screenshots on failure may capture vault content visible in the Obsidian window; screenshots are stored in a gitignored directory and must not contain sensitive note content (test vault contains only sample notes)

## Dependencies

- Sprint 003 complete — existing test infrastructure established
- `@playwright/test` npm package with Electron support
- Obsidian desktop app installed on the test machine (not required for skip behavior)
- `main.js` must be built before E2E tests run — enforced by `make test-e2e` running `make build` first

## Open Questions

1. **Vault picker on first launch**: Obsidian's behavior on first launch varies by version and platform. The sprint assumes `--vault <path>` is workable or that vault-picker automation is feasible. This needs validation on the target machine during implementation.

2. **Community-plugins safe mode**: Newer Obsidian versions may require accepting a "safe mode" prompt. The vault factory should pre-configure `safe-mode.json` or equivalent to bypass this.

3. **Agent interaction depth**: This sprint explicitly defers agent message-send tests to a future sprint. If the planner wants message-send covered here, the scope expands significantly and would require mock agent injection.
