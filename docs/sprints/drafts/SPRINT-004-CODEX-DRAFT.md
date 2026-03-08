# Sprint 004 Draft (Codex): E2E Test Suite (Obsidian UI Automation)

## Sprint Goal
Add a deterministic E2E test suite that launches the real Obsidian desktop app against an isolated temporary vault, verifies AI Agent Sidebar plugin load + core UI flows, and runs via `make test-e2e` / `npm run test-e2e` without affecting existing unit (`npm test`) and integration (`npm run test-integration`) suites.

## Scope

### In Scope
- Add a dedicated E2E suite and config, separate from unit/integration tests.
- Add `npm run test-e2e` script and `make test-e2e` target.
- Build plugin artifacts before test launch and fail fast if missing.
- Create a fresh temporary vault per test run with plugin files pre-installed.
- Launch Obsidian via Playwright Electron automation.
- Validate core flows:
  - plugin loads without startup errors
  - AI Agent Sidebar can be opened (command palette and/or ribbon path)
  - plugin settings panel opens
  - provider settings cards render
  - at least one provider enable toggle is clickable
  - sidebar empty state renders when providers are disabled
- Skip suite cleanly when Obsidian binary is not available.
- Cleanup all temporary vault directories after run.

### Out of Scope
- Real provider network calls, API key validation, or model-fetching assertions.
- Real CLI agent execution from E2E tests.
- Obsidian core behavior verification outside plugin touchpoints.
- Visual snapshot baseline system.
- CI pipeline rollout beyond local command support (can be planned later).

## Current-State Baseline
- `package.json` currently has `test` and `test-integration`; no `test-e2e` script.
- `Makefile` currently has `test` and `test-integration`; no `test-e2e` target.
- Existing test coverage is Node-only (unit + integration), no real Obsidian runtime tests.
- `manifest.json` has plugin id `ai-agent-sidebar`; dev vault Make target uses folder `obsidian-ai-agent-sidebar`.
- Plugin view/UX surfaces to target exist:
  - command id: `open` (label: `Open sidebar`)
  - ribbon tooltip: `Open AI agent sidebar`
  - empty-state text: `No agents enabled.`
  - settings heading: provider section with `Providers` title

## E2E Boundary (Locked)
A test is E2E for this sprint only if it includes all of:
1. real Obsidian Electron process,
2. real plugin load from built artifacts,
3. UI interaction through rendered app windows.

Node-only tests remain in integration scope, not E2E.

## Proposed Test Layout

```text
tests/
└── e2e/
    ├── helpers/
    │   ├── obsidianBinary.ts       # binary discovery + skip reason
    │   ├── vaultFactory.ts         # mkdtemp vault + plugin install + enable files
    │   ├── electronHarness.ts      # launch/close helpers and first-window readiness
    │   └── selectors.ts            # centralized resilient selectors + text matchers
    ├── plugin-load.e2e.test.ts
    ├── sidebar-open.e2e.test.ts
    └── settings-ui.e2e.test.ts
vitest.e2e.config.ts
```

## Tooling and Harness Changes

### `package.json`
Add script:
- `"test-e2e": "vitest run --config vitest.e2e.config.ts"`

### `Makefile`
- Add `test-e2e` to `.PHONY`.
- Add target:
  - `test-e2e: npm run test-e2e`

### `vitest.e2e.config.ts` (new)
- `environment: "node"`
- include only `tests/e2e/**/*.e2e.test.ts`
- longer timeout (`60_000`) due to desktop app launch
- single-thread execution (`fileParallelism: false`) to avoid multi-instance Obsidian conflicts
- setup file for shared skip checks / cleanup registry

### Dependencies
- Add dev dependency: `playwright` (Electron automation API).
- No additional assertion framework needed (Vitest + Playwright locators).

## Obsidian Launch Strategy

### Binary Resolution Order
`tests/e2e/helpers/obsidianBinary.ts` resolves path in this order:
1. `OBSIDIAN_PATH` env var (explicit override)
2. platform defaults:
   - macOS: `/Applications/Obsidian.app/Contents/MacOS/Obsidian`
   - Linux: first found in `obsidian`, `obsidian-appimage`, `/usr/bin/obsidian`
   - Windows: `%LOCALAPPDATA%/Obsidian/Obsidian.exe`
3. PATH lookup (`which`/`where`) fallback

If none found, tests call `test.skip` with clear reason.

### Vault Bootstrap
`vaultFactory.ts` creates per-test temp vault with:
- `.obsidian/plugins/ai-agent-sidebar/{main.js,manifest.json,styles.css}` copied from repo root
- `.obsidian/community-plugins.json` set to `["ai-agent-sidebar"]`
- `.obsidian/core-plugins.json` includes minimal defaults (if needed)
- seed note for deterministic landing state

### Launch Args
Use `electron.launch({ executablePath, args: [vaultPath] })` first. If required by platform behavior, fallback to `args: ["--vault", vaultPath]`.

First-run vault picker must be bypassed by direct vault path argument and pre-created vault metadata.

## Test Plan by Scenario

### 1) Plugin Load Smoke (`plugin-load.e2e.test.ts`)
Scenarios:
1. Obsidian launches against temp vault and window becomes interactive.
2. Plugin appears enabled (community plugin state present + no plugin crash indicator).
3. No startup error modal referencing plugin id/name.

Assertions:
- main window title or workspace shell is present
- no fatal plugin load dialog text for `AI Agent Sidebar` / `ai-agent-sidebar`
- test captures screenshot on failure

### 2) Sidebar Open Flow (`sidebar-open.e2e.test.ts`)
Scenarios:
1. Open command palette (`Mod+P`/`Ctrl+P`), run `Open sidebar` command.
2. Verify sidebar container renders (`ai-sidebar-root` subtree).
3. Alternate path (if command palette selector drifts): click ribbon button with tooltip `Open AI agent sidebar`.

Assertions:
- sidebar root appears
- tab bar and/or empty-state area appears
- no JS crash toast after open action

### 3) Settings + Provider Controls (`settings-ui.e2e.test.ts`)
Scenarios:
1. Open settings.
2. Navigate to plugin settings tab `AI Agent Sidebar`.
3. Verify `Providers` section renders cards.
4. Toggle at least one provider enable switch (e.g., first `.ais-card .ais-toggle input`).
5. Disable all providers and verify sidebar shows `No agents enabled.`

Assertions:
- at least one provider card exists
- toggle click changes checked state
- empty-state text appears in sidebar when no enabled providers remain

## Determinism Strategy
- Fresh temp vault per test file (or per test for stricter isolation).
- No network assertions, no API key dependencies.
- Disable parallel E2E execution.
- Centralized `waitFor` helpers with explicit timeout and post-action stabilization.
- On failure: persist screenshot + minimal DOM dump under `tests/e2e/artifacts/`.

## Incremental Execution Plan

### Phase 1: Command Wiring + Config
- Add `vitest.e2e.config.ts`.
- Add `test-e2e` npm script.
- Add `test-e2e` Makefile target.
- Add `playwright` dev dependency.

### Phase 2: Harness + Vault Factory
- Implement binary discovery helper.
- Implement temp vault setup/teardown helper.
- Implement launch helper (`electron.launch`, ready-state waits, close cleanup).
- Add graceful skip utility for missing binary.

### Phase 3: Smoke Test
- Implement `plugin-load.e2e.test.ts`.
- Validate launch, plugin-loaded baseline, and teardown reliability.

### Phase 4: Sidebar and Settings Coverage
- Implement `sidebar-open.e2e.test.ts` and `settings-ui.e2e.test.ts`.
- Add resilient selector utility and fallback interactions.

### Phase 5: Hardening
- Stabilize flaky selectors and waits.
- Add failure artifacts (screenshots) for triage.
- Run full matrix: `npm test`, `npm run test-integration`, `npm run test-e2e`, `npm run build`.

## Acceptance Criteria
1. `npm run test-e2e` executes the E2E suite independently.
2. `make test-e2e` runs the same suite.
3. E2E suite skips cleanly with explicit message if Obsidian binary is missing.
4. E2E suite launches real Obsidian with a fresh vault and installed plugin.
5. Tests verify sidebar open flow and settings provider UI rendering.
6. At least one provider toggle interaction is verified.
7. "No agents enabled." state is verified.
8. Temporary vault directories are cleaned up after run.
9. Existing `npm test` and `npm run test-integration` remain unaffected.

## Verification Matrix
- Obsidian binary absent -> suite skipped with reason, exit non-crash.
- Plugin artifacts missing (`main.js` etc.) -> immediate actionable failure.
- Launch with temp vault -> app window ready within timeout.
- Open sidebar command -> `ai-sidebar-root` appears.
- Open plugin settings -> `Providers` header visible.
- Toggle provider switch -> checked state changes.
- Disable all providers -> `No agents enabled.` shown.
- Run finishes -> no leftover temp vault dirs.

## Risks and Mitigations
1. Obsidian DOM/selector drift across app versions.
- Mitigation: prefer plugin-owned class selectors (`.ai-sidebar-*`, `.ais-*`), keep app-level selectors centralized and minimal.

2. Platform differences in Obsidian launch arguments.
- Mitigation: binary resolver + argument fallback (`<vaultPath>` then `--vault <vaultPath>`), clear error messages.

3. First-run/welcome UI interrupts deterministic flow.
- Mitigation: pre-seeded vault metadata and startup wait utility that handles initial workspace readiness before interactions.

4. E2E runtime flakiness due to async Electron startup.
- Mitigation: serial test execution, longer timeout budget, explicit readiness checks, screenshot artifacts on failure.

5. Plugin folder id mismatch (`manifest.id` vs Makefile plugin folder variable) causes load confusion.
- Mitigation: E2E vault factory uses manifest id (`ai-agent-sidebar`) as canonical plugin directory and validates copied files before launch.

## Definition of Done
- E2E test harness and commands are merged.
- E2E tests are separated from unit/integration suites by directory and config.
- Core UI scenarios from sprint intent pass locally where Obsidian is installed.
- Missing-Obsidian path skips cleanly.
- Temp resources are cleaned.
- Type-check/build still pass.

## Open Decisions
1. Should `test-e2e` be opt-in local only now, or added to CI behind a dedicated workflow + virtual display setup?
2. Should we add lightweight test IDs in plugin UI (`data-e2e`) this sprint to improve selector stability, or defer until instability is observed?
3. Should E2E run per-commit locally via `make test`, or remain a separate explicit command due to runtime cost?
