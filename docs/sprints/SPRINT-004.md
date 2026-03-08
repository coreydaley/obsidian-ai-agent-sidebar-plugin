# Sprint 004: E2E Test Suite (Obsidian UI Automation)

**Status:** Planned

## Overview

Sprints 001–003 delivered a feature-complete plugin and a comprehensive Node-based test suite. What's missing is a test that runs the product the way a user does: opening Obsidian, loading the plugin, and interacting with the sidebar. This sprint adds that top-layer validation.

The approach uses **Playwright's Electron API** (via the `playwright` npm package) called from Vitest tests — keeping the test runner consistent with the existing `test` and `test-integration` suites. Tests launch the real Obsidian application against a temporary vault with the plugin pre-installed, exercise the core UI surfaces, and tear down cleanly. The command is `make test-e2e` / `npm run test-e2e`, fully independent of existing test suites.

Scope is deliberately shallow: verify the plugin loads without errors, the sidebar opens, and the settings UI renders the four provider sections. Agent interaction (sending messages, streaming responses) is explicitly deferred — it would require real CLI agents or API keys and introduces significant flakiness. The goal is a reliable, fast (~60 second), gracefully-skippable suite that proves the plugin correctly installs and surfaces in Obsidian's UI.

## Use Cases

1. **Plugin load verification**: After installation, Obsidian loads the plugin without an error modal.
2. **Sidebar open via ribbon**: Clicking the ribbon icon opens the AI Agent Sidebar panel.
3. **Sidebar open via command palette**: `Cmd+P` / `Ctrl+P` → "Open sidebar" opens the panel.
4. **Empty state display**: When no providers are enabled, the sidebar shows "No agents enabled."
5. **Settings UI rendering**: The settings page shows all four provider sections (Anthropic, OpenAI, Google, GitHub).
6. **Enable toggle interaction**: Clicking a provider enable toggle changes its state.
7. **Graceful skip**: When Obsidian is not installed, `make test-e2e` exits 0 with a clear skip message.

## Architecture

```
tests/e2e/
├── helpers/
│   ├── obsidianBinary.ts     Find Obsidian binary (env var → platform defaults → which)
│   ├── vaultFactory.ts       Create/populate/cleanup temp vault with plugin installed
│   ├── electronHarness.ts    Launch Obsidian via Playwright electron.launch(); manage lifecycle
│   └── selectors.ts          Centralized selectors (plugin data-testid + Obsidian aria-labels)
├── plugin-load.e2e.test.ts   Plugin enables without errors, no crash modal
├── sidebar-open.e2e.test.ts  Ribbon open, command palette open, empty state
└── settings-ui.e2e.test.ts   Settings page, four provider sections, toggle interaction

vitest.e2e.config.ts          Vitest config (Electron + Playwright API, 60s timeout, serial)
```

### Test Runner

Uses `vitest run --config vitest.e2e.config.ts` — same Vitest runner as unit and integration tests. The `playwright` package (not `@playwright/test`) provides the Electron launch API. This preserves repo test tooling consistency (no third runner harness).

### Binary Discovery

`obsidianBinary.ts` resolves the Obsidian executable in this order:
1. `OBSIDIAN_BINARY` env var (explicit override; CI support via env)
2. Platform-specific defaults:
   - macOS: `/Applications/Obsidian.app/Contents/MacOS/Obsidian`
   - Linux: `which obsidian` fallback (AppImage locations vary too widely to hardcode)
   - Windows: `%LOCALAPPDATA%\Obsidian\Obsidian.exe`
3. Returns `null` if not found → all tests call `ctx.skip()` with clear message

Binary path must be an absolute path to a readable executable file; relative paths or non-executable paths are rejected.

### Vault Setup

Each test file gets a fresh vault in `os.tmpdir()`:

```
<tmpdir>/obsidian-e2e-<timestamp>/
└── vault/
    ├── .obsidian/
    │   ├── community-plugins.json    ["ai-agent-sidebar"]
    │   ├── app.json                  {"vaultName": "e2e-test-vault"}
    │   └── plugins/
    │       └── ai-agent-sidebar/     ← plugin id from manifest.json
    │           ├── main.js           (copied from project root)
    │           ├── manifest.json
    │           └── styles.css
    └── Welcome.md                    (seed note for landing state)
```

Plugin folder name is `ai-agent-sidebar` (the `id` field from `manifest.json`), not the npm package name. The `vaultFactory.ts` helper verifies `main.js` exists in the project root before creating the vault; if missing, it throws a clear error: "Plugin not built — run 'npm run build' first."

`cleanup()` calls `fs.rm(vaultPath, { recursive: true, force: true })` in a `try/finally` block.

### Obsidian Launch

```typescript
const app = await electron.launch({
  executablePath: binaryPath,
  args: [vaultPath],   // positional vault path (Obsidian convention on macOS/Linux)
});
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
```

If `args: [vaultPath]` fails to bypass the vault picker (detected by vault-picker UI appearing), the harness retries with `args: ['--vault', vaultPath]`. If both fail, the test suite skips with a clear message rather than failing.

Startup handling:
- If a "Trust plugin" modal appears: click through it automatically
- If a vault-picker dialog appears and bypassing via args failed: skip tests with clear reason
- `quitObsidian(app)` calls `app.close()` after each test file

### Selector Strategy

Selectors are centralized in `selectors.ts` to minimize maintenance. Two levels:

1. **Plugin-owned** (`data-testid` attributes added to plugin source in Phase 4 of this sprint):
   - `[data-testid="ai-agent-sidebar"]` — sidebar root element
   - `[data-testid="ai-agent-empty-state"]` — "No agents enabled" element
   - `[data-testid="ai-agent-settings-section-anthropic"]` (and `openai`, `google`, `github`)
   - `[data-testid="ai-agent-enable-toggle-claude"]` (and `codex`, `gemini`, `copilot`)

2. **Obsidian structural** (stable aria-labels, changed rarely):
   - `[aria-label="Open AI agent sidebar"]` — ribbon button
   - Command palette trigger: `Mod+P`
   - Settings gear: structural Obsidian selectors (abstracted in `selectors.ts`)

## Implementation Plan

### Phase 1: Command Wiring & Config (~15%)

**Files:**
- `package.json` — add `"test-e2e"` script, add `playwright` devDependency
- `Makefile` — add `test-e2e` target, add to `.PHONY`
- `vitest.e2e.config.ts` — new Vitest config for E2E

**Tasks:**
- [ ] Install `playwright` as pinned exact-version devDependency (no `^` or `~`)
- [ ] Add `"test-e2e": "vitest run --config vitest.e2e.config.ts"` to `package.json` scripts
- [ ] Add `test-e2e` to Makefile `.PHONY` and add target:
  ```makefile
  test-e2e: build
  	npm run test-e2e
  ```
  (depends on `build` so plugin is always fresh before E2E)
- [ ] Create `vitest.e2e.config.ts`:
  ```typescript
  import { defineConfig } from "vitest/config";
  export default defineConfig({
    test: {
      environment: "node",
      include: ["tests/e2e/**/*.e2e.test.ts"],
      testTimeout: 60_000,
      fileParallelism: false,   // serial: Obsidian is single-instance
      reporter: [["verbose"], ["html", { outputFile: "tests/e2e/artifacts/report.html" }]],
    },
  });
  ```

### Phase 2: Helpers (~20%)

**Files:**
- `tests/e2e/helpers/obsidianBinary.ts`
- `tests/e2e/helpers/vaultFactory.ts`
- `tests/e2e/helpers/electronHarness.ts`
- `tests/e2e/helpers/selectors.ts`

**Tasks:**
- [ ] `obsidianBinary.ts`:
  - Export `findObsidianBinary(): string | null`
  - Check `OBSIDIAN_BINARY` env var (validate it's an absolute path to executable)
  - Platform-specific defaults (macOS: `/Applications/Obsidian.app/Contents/MacOS/Obsidian`; Windows: `%LOCALAPPDATA%\Obsidian\Obsidian.exe`; Linux: `which obsidian`)
  - Validate: path must be absolute, `fs.accessSync(path, fs.constants.X_OK)` passes
  - Return `null` if not found; no throwing

- [ ] `vaultFactory.ts`:
  - Export `createTestVault(): Promise<{ vaultPath: string; cleanup: () => Promise<void> }>`
  - `fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-e2e-'))` for unique directory
  - Write `.obsidian/community-plugins.json`, `.obsidian/app.json`
  - Copy `main.js`, `manifest.json`, `styles.css` from project root into plugin dir; throw if `main.js` missing
  - Create a `Welcome.md` file
  - `cleanup()` uses `try/finally` to ensure cleanup even on crash

- [ ] `electronHarness.ts`:
  - Export `launchObsidian(binaryPath: string, vaultPath: string): Promise<{ app: ElectronApplication; page: Page }>`
  - Try `args: [vaultPath]` first; detect vault picker and retry with `--vault` flag
  - Wait for `domcontentloaded` and 500ms stabilization pause
  - Auto-dismiss "Trust this plugin" modal if it appears
  - Export `quitObsidian(app: ElectronApplication): Promise<void>`

- [ ] `selectors.ts`:
  - Export constants for all plugin-owned `data-testid` selectors
  - Export constants for Obsidian structural selectors (ribbon button aria-label, command palette)
  - Keep selector logic out of test files entirely

### Phase 3: Plugin `data-testid` Attributes (~10%)

**Files:**
- `src/AgentSidebarView.ts` — add `data-testid` to sidebar root and empty state
- `src/settings.ts` — add `data-testid` to provider sections and enable toggles

**Tasks:**
- [ ] In `AgentSidebarView.onOpen()`, set `data-testid="ai-agent-sidebar"` on the root container element
- [ ] In `AgentSidebarView.renderEmptyState()`, set `data-testid="ai-agent-empty-state"` on the empty state div
- [ ] In `settings.ts`, set `data-testid="ai-agent-settings-section-${provider.id}"` on each provider section container
- [ ] In `settings.ts`, set `data-testid="ai-agent-enable-toggle-${agent.id}"` on each enable toggle container element
- [ ] Run `npm run build` to verify no TypeScript errors

### Phase 4: E2E Tests (~50%)

**Files:**
- `tests/e2e/plugin-load.e2e.test.ts`
- `tests/e2e/sidebar-open.e2e.test.ts`
- `tests/e2e/settings-ui.e2e.test.ts`

**Tasks:**

Each test file follows this pattern:
```typescript
const binary = findObsidianBinary();
let vault: Awaited<ReturnType<typeof createTestVault>>;
let app: ElectronApplication;
let page: Page;

beforeAll(async (ctx) => {
  if (!binary) { ctx.skip(); return; }
  vault = await createTestVault();
  ({ app, page } = await launchObsidian(binary, vault.vaultPath));
});
afterAll(async () => {
  await quitObsidian(app);
  await vault?.cleanup();
});
```

#### `plugin-load.e2e.test.ts`
- [ ] Test: Obsidian window loads and workspace shell is present (verify `.workspace` or equivalent container exists)
- [ ] Test: No plugin-crash error modal — `page.locator('.modal-bg')` should not contain text matching `/ai.?agent.?sidebar|error loading/i` after 3s
- [ ] Test: Plugin ID present in vault's `community-plugins.json` — read file and verify `"ai-agent-sidebar"` is listed (sanity check for vault setup)

#### `sidebar-open.e2e.test.ts`
- [ ] Test: Ribbon icon opens sidebar — click `[aria-label="Open AI agent sidebar"]`; verify `[data-testid="ai-agent-sidebar"]` becomes visible
- [ ] Test: Command palette opens sidebar — press `Mod+P`, type "Open sidebar", press Enter; verify `[data-testid="ai-agent-sidebar"]` is visible
- [ ] Test: Sidebar shows empty state — once sidebar is open with no providers enabled, verify `[data-testid="ai-agent-empty-state"]` is visible

#### `settings-ui.e2e.test.ts`
- [ ] Test: Settings page opens — use Obsidian settings command or gear icon; verify settings container renders
- [ ] Test: AI Agent Sidebar settings section is present — navigate to plugin settings tab; verify section heading "AI Agent Sidebar" is visible
- [ ] Test: Four provider sections render — verify all four `data-testid` provider section elements are present: `anthropic`, `openai`, `google`, `github`
- [ ] Test: Enable toggle present and interactive — verify at least one `[data-testid^="ai-agent-enable-toggle-"]` is present; click it; verify the checked/unchecked state changes

### Phase 5: Failure Artifacts & Hardening (~5%)

**Tasks:**
- [ ] Add `page.screenshot({ path: `tests/e2e/artifacts/fail-${testName}.png` })` in the `afterEach` hook when `state === 'failed'`
- [ ] Add `tests/e2e/artifacts/` to `.gitignore`
- [ ] Run full matrix: `npm test`, `make test-integration`, `make test-e2e`
- [ ] Document Obsidian version tested in a comment in `electronHarness.ts`

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add `"test-e2e"` script; add `playwright` pinned devDependency |
| `Makefile` | Modify | Add `test-e2e` target (depends on `build`); add to `.PHONY` |
| `vitest.e2e.config.ts` | Create | Vitest config: node env, 60s timeout, serial, E2E include pattern |
| `tests/e2e/helpers/obsidianBinary.ts` | Create | Platform-specific Obsidian binary finder with env var override |
| `tests/e2e/helpers/vaultFactory.ts` | Create | Create/populate/cleanup temp test vault with plugin pre-installed |
| `tests/e2e/helpers/electronHarness.ts` | Create | Launch Obsidian via Playwright Electron API; handle vault picker + trust modal |
| `tests/e2e/helpers/selectors.ts` | Create | Centralized selectors: plugin data-testid + Obsidian aria-labels |
| `src/AgentSidebarView.ts` | Modify | Add `data-testid` to sidebar root and empty state elements |
| `src/settings.ts` | Modify | Add `data-testid` to provider section containers and enable toggles |
| `tests/e2e/plugin-load.e2e.test.ts` | Create | Plugin load smoke: window ready, no crash modal, vault sanity |
| `tests/e2e/sidebar-open.e2e.test.ts` | Create | Ribbon open, command palette open, empty state verification |
| `tests/e2e/settings-ui.e2e.test.ts` | Create | Settings page, 4 provider sections, toggle interaction |
| `.gitignore` | Modify | Add `tests/e2e/artifacts/` |

## Definition of Done

- [ ] `make test-e2e` runs all E2E tests and passes on a machine with Obsidian installed
- [ ] `make test-e2e` exits with code 0 and a clear skip message on a machine without Obsidian — but **if the Obsidian binary is found and launch fails**, the suite must exit non-zero (hard fail, not skip)
- [ ] `npm test` (unit) and `make test-integration` continue to pass unaffected
- [ ] `npm run build` passes — no TypeScript errors from `data-testid` additions
- [ ] Plugin loads without error modal (verified by E2E test)
- [ ] Plugin load test also attaches `page.on('console', ...)` listener and fails if any `error`-level message references the plugin name or "ai-agent-sidebar"
- [ ] Sidebar opens via ribbon icon (verified by E2E test, using correct aria-label `"Open AI agent sidebar"`)
- [ ] Sidebar opens via command palette command `"Open sidebar"` (verified by E2E test)
- [ ] Empty state `"No agents enabled."` shown when no providers enabled (verified by E2E test)
- [ ] All four provider settings sections render (Anthropic, OpenAI, Google, GitHub) — verified by E2E test
- [ ] Enable toggle interaction verified by checking DOM `checked`/`aria-checked` state before and after click — not just that the click completed
- [ ] When Obsidian binary is found and at least one test file runs, the test output log confirms at least one test **executed** (not all skipped)
- [ ] Each test file creates a fresh vault in a unique `os.tmpdir()` subdirectory
- [ ] All temp vault directories cleaned up after tests (even on failure — `try/finally`)
- [ ] `playwright` added as pinned exact-version devDependency
- [ ] No modification to the user's global Obsidian configuration (`~/.config/obsidian/`)
- [ ] Screenshots saved to `tests/e2e/artifacts/<test-name>/` on test failure; directory is gitignored
- [ ] `data-testid` attributes added to: sidebar root, empty state, four provider sections, four enable toggles
- [ ] Plugin folder in test vault uses `ai-agent-sidebar` (manifest `id`), not npm package name
- [ ] `main.js` missing → vault factory throws clear error ("Plugin not built — run 'npm run build' first")
- [ ] `vitest.e2e.config.ts` excludes E2E files from `tsconfig.json` / existing unit/integration builds
- [ ] `npm audit` run after `playwright` devDependency added; no high/critical findings unresolved
- [ ] Trust modal auto-dismiss matches specific known modal text (documented in `electronHarness.ts`); if modal text doesn't match, the harness logs a warning rather than silently clicking wrong controls
- [ ] `tests/e2e/README.md` created documenting: tested Obsidian version, platform, how to run, and known limitations

## Verification Matrix

| Scenario | Expected |
|----------|----------|
| Obsidian binary not found | Suite skips with clear reason; `make test-e2e` exits 0 |
| `main.js` missing | `vaultFactory` throws clear error before launch |
| Obsidian launches with temp vault | Window ready within 60s timeout |
| Ribbon click | `[data-testid="ai-agent-sidebar"]` visible |
| Command palette "Open sidebar" | `[data-testid="ai-agent-sidebar"]` visible |
| No providers enabled | `[data-testid="ai-agent-empty-state"]` visible with "No agents enabled." text |
| Settings → AI Agent Sidebar | All 4 `[data-testid="ai-agent-settings-section-*"]` elements visible |
| Enable toggle click | Toggle checked state changes |
| Test failure | Screenshot saved to `tests/e2e/artifacts/` |
| Test completes | Temp vault directory cleaned up |
| `npm test` after sprint | Unit tests still pass |
| `make test-integration` after sprint | Integration tests still pass |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Obsidian vault picker appears despite vault arg | High | High | Auto-detect vault picker appearance; retry with `--vault` flag; skip if both fail |
| "Trust plugin" modal blocks test flow | High | High | Auto-dismiss in `electronHarness.ts`; detect by modal text |
| Obsidian DOM selectors change across versions | High | Medium | Use plugin-owned `data-testid` for all plugin UI; minimize Obsidian structural selectors |
| `args: [vaultPath]` not supported on all platforms | Medium | Medium | Try positional first, then `--vault`; document platform behavior |
| Tests flaky due to Electron startup timing | Medium | Medium | `fileParallelism: false`; 60s timeout; explicit `waitForSelector` (never `waitForTimeout`) |
| `playwright` version incompatibility with installed Electron (Obsidian) | Medium | Medium | Pin `playwright` version; document tested Obsidian version in `electronHarness.ts` |
| Leftover temp dirs from crashed test runs | Low | Low | `afterAll` `try/finally` cleanup; OS temp dir management |

## Security Considerations

- **Temp vault isolation**: Each test creates a unique temp directory in `os.tmpdir()`; no real user vault data is touched, read, or modified
- **No user global config modified**: The `--vault` arg approach avoids any writes to `~/.config/obsidian/`; if vault arg fails, tests skip rather than modifying user config
- **Binary path validation**: `findObsidianBinary()` validates the resolved path is absolute and executable; rejects relative paths
- **No API keys in E2E tests**: Tests exercise settings UI only — no agent invocation, no API keys required
- **Screenshot data**: Playwright screenshots on failure may capture Obsidian window content; screenshots are stored in a gitignored directory; test vault contains only generated sample notes (no sensitive content)
- **Electron launch args as array**: `electron.launch({ args: [...] })` passes args as an array, never as a shell-constructed string — no injection surface

## Dependencies

- Sprint 003 complete — existing test infrastructure established; `vitest.integration.config.ts` pattern to follow
- `playwright` npm package (Electron API)
- Obsidian desktop app installed on the test machine (skip gracefully if absent)
- `main.js` must be built before E2E — enforced by `make test-e2e` depending on `build` target

## Open Questions

1. **Vault picker bypass reliability**: Whether `args: [vaultPath]` bypasses the vault picker reliably depends on the Obsidian version. This must be verified during implementation. If unreliable on a given platform, document as unsupported and skip.

2. **First-run "safe mode" prompt**: Some Obsidian versions may show a "Restricted Mode" toggle. The vault factory should pre-populate any required config to bypass this, or the harness should handle it.

## Critiques Addressed

*From Codex's critique of the Claude draft:*
- **Framework split**: Switched to Vitest + `playwright` API (not Playwright test runner). ✓
- **Command/label strings corrected**: Command is `"Open sidebar"`; ribbon is `"Open AI agent sidebar"`. ✓
- **Global config fallback removed**: If vault arg fails, skip with message; no mutation of user config. ✓
- **Empty state location**: `data-testid` added in `AgentSidebarView.ts` (line ~129), not `AgentChatTab.ts`. ✓
- **Linux binary path fixed**: Uses `which obsidian` fallback instead of hardcoded `.desktop` entry path. ✓
- **Skip mechanism**: Fixture-level `ctx.skip()` in `beforeAll` hook. ✓
- **Electron version pinning replaced**: Pin `playwright` version; document tested Obsidian version in code. ✓
- **Plugin folder id**: Vault factory uses `ai-agent-sidebar` from `manifest.json`. ✓

*From devil's advocate review (Codex):*
- **Skip vs. fail distinction**: Binary not found → skip (exit 0); binary found but launch failed → hard fail (exit non-zero). Added to DoD. ✓
- **Weak plugin-load detection**: Added `page.on('console')` error listener to plugin-load test. Added to DoD. ✓
- **"Green but non-executing" risk**: Added DoD item requiring at least one test executes when binary is present. ✓
- **Toggle assertion too weak**: DoD now requires `checked`/`aria-checked` DOM state verification before and after click. ✓
- **Trust modal fragility**: `electronHarness.ts` must document matched modal text; warns (not silently clicks) on mismatch. Added to DoD. ✓
- **No test documentation**: Added `tests/e2e/README.md` with Obsidian version/platform/instructions to DoD. ✓

*Critiques rejected (with reasoning):*
- **CI execution requirement**: User explicitly chose local-developer-only scope in interview (Question 4). This is accepted.
- **Settings persistence via reload**: Adds significant test complexity; deferred to a future sprint.
- **Flake budget/repeatability gate**: Impractical for a first E2E sprint; addressed by `fileParallelism: false` and explicit `waitForSelector`.
- **Cross-platform acceptance bar**: Local dev focus is intentional; platform support documented as limitation.
