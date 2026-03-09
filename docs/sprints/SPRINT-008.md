# Sprint 008: Live E2E Tests

**Status:** Planned

## Overview

Seven sprints built a feature-complete plugin and a full mock-based test pyramid. Every layer — unit, integration, and E2E — has been verified against stubbed or mocked external services. The one remaining gap is proof that the plugin works against *real* CLIs and real APIs.

This sprint creates a separate `tests/e2e-live/` directory containing tests that assume real credentials and CLIs are available on the developer's machine. They are explicitly excluded from `make test` and run only via `make test-e2e-live`. The tests reuse all existing infrastructure (electronHarness, vaultFactory, selectors, obsidianBinary) without modification to production source.

Coverage spans six describe blocks: three CLI agents (claude, codex, copilot — each with a simple chat test and a file-creation test, yoloMode enabled), and three API agents (claude, codex, gemini in API mode — each with a model-list verification, a chat test, and a file-creation test). OpenAI-compatible agent is explicitly out of scope.

## Use Cases

1. **Claude CLI — chat**: Enable claude in CLI mode with yoloMode; send "Say hello briefly"; verify a non-empty, non-error response appears.
2. **Claude CLI — file create**: Send a prompt with embedded :::file-op write block; verify `live-e2e-cli-claude.md` exists in vault.
3. **Codex CLI — chat + file create**: Same pattern for codex.
4. **Copilot CLI — chat + file create**: Same pattern for copilot.
5. **Claude API — model list**: Open settings with claude in API mode; verify model select has > 2 options AND no fallback warning text is visible.
6. **Claude API — chat + file create**: Send a message; verify response; verify `live-e2e-api-claude.md` created.
7. **Codex API — model list + chat + file create**: Same as (5)+(6) for codex.
8. **Gemini API — model list + chat + file create**: Same as (5)+(6) for gemini.

## Architecture

```
New files:
  vitest.e2e-live.config.ts                         new vitest config for live suite
  tests/e2e-live/helpers/liveHelpers.ts              shared helpers (prereq guards, chat utils, file polling)
  tests/e2e-live/cli-agents.e2e-live.test.ts         3 describe blocks: claude, codex, copilot CLI
  tests/e2e-live/api-agents.e2e-live.test.ts         3 describe blocks: claude, codex, gemini API
  tests/e2e-live/README.md                           prerequisites and run instructions

Modified files:
  package.json     add "test-e2e-live" script
  Makefile         add test-e2e-live target (NOT in test aggregate); update help
  CLAUDE.md        add make test-e2e-live to build section

Imports (live test files → existing helpers):
  tests/e2e-live/* → ../e2e/helpers/electronHarness
  tests/e2e-live/* → ../e2e/helpers/vaultFactory
  tests/e2e-live/* → ../e2e/helpers/selectors
  tests/e2e-live/* → ../e2e/helpers/obsidianBinary
```

### Prerequisite Guard Logic

```
CLI describe beforeAll:
  1. if (!findObsidianBinary()) → ctx.skip()
  2. if (!isBinaryInstalled("<agent>")) → ctx.skip()   // execSync("which <cmd>")
  3. createTestVault({ <agent>: { enabled: true, yoloMode: true, accessMode: "cli" } })
  4. launchObsidian(...) catch ObsidianLaunchError → ctx.skip()

API describe beforeAll:
  1. if (!findObsidianBinary()) → ctx.skip()
  2. if (!resolveApiKey("<PROVIDER_API_KEY_VAR>")) → ctx.skip()   // check process.env
  3. createTestVault({ <agent>: { enabled: true, accessMode: "api" } })
     (NO apiKey override in data.json — rely on plugin's shell env resolution at runtime)
  4. launchObsidian(..., { keepSettingsOpen: true }) catch ObsidianLaunchError → ctx.skip()
  5. navigateToPluginSettings(page)
```

### File Creation Prompt

Both CLI and API describes use the same explicit prompt to minimize LLM compliance risk:

```ts
function buildFileCreatePrompt(filename: string): string {
  return (
    `Write this exact file-op block and nothing else:\n` +
    `:::file-op\n` +
    `{"op":"write","path":"${filename}","content":"Created by live E2E test."}\n` +
    `:::\n`
  );
}
```

### Model List Assertion

```ts
// Wait for the select to have > 2 options (live fetch complete)
const modelSelect = page.locator(`${MODEL_FIELD_SELECTOR} select`);
await modelSelect.waitFor({ state: "visible", timeout: 30_000 });
const count = await modelSelect.evaluate((el: HTMLSelectElement) => el.options.length);
expect(count).toBeGreaterThan(2);

// Also verify no fallback warning (proves live fetch, not just defaults)
const warning = page.locator(`${SETTINGS_SECTION_SELECTOR}`)
  .getByText(/could not fetch models/i);
expect(await warning.count()).toBe(0);

// Also verify at least one option value contains provider-specific model name pattern
// (prevents passing with generic default entries that don't reflect a live fetch)
// claude → "claude-", codex/openai → "gpt-" or "o1"/"o3", gemini → "gemini-"
const values = await modelSelect.evaluate((el: HTMLSelectElement) =>
  Array.from(el.options).map(o => o.value)
);
const PROVIDER_PATTERNS: Record<string, RegExp> = {
  claude: /claude-/i,
  codex:  /gpt-|^o\d/i,
  gemini: /gemini-/i,
};
// pattern for this agent is checked in each describe block
```

### Vitest Config

```ts
// vitest.e2e-live.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e-live/**/*.e2e-live.test.ts"],
    testTimeout: 120_000,   // live LLMs are slower than mocks
    hookTimeout: 90_000,
    fileParallelism: false, // sequential; Obsidian is single-instance on macOS
    reporters: ["verbose"],
  },
});
```

## Implementation Plan

### P0: Must Ship

#### Phase 1: Config and build wiring (~10%)

**Files:** `vitest.e2e-live.config.ts`, `package.json`, `Makefile`

**Tasks:**
- [ ] Create `vitest.e2e-live.config.ts` with include pattern `tests/e2e-live/**/*.e2e-live.test.ts`, `testTimeout: 120_000`, `hookTimeout: 90_000`, `fileParallelism: false`
- [ ] Add `"test-e2e-live": "vitest run --config vitest.e2e-live.config.ts"` to `package.json` scripts
- [ ] Add `test-e2e-live` to Makefile `.PHONY`
- [ ] Add Makefile target:
  ```makefile
  test-e2e-live: build
  	npm run test-e2e-live
  ```
- [ ] **Do NOT** add `test-e2e-live` to the `test` target or any aggregate — verify `make test` is unchanged
- [ ] Update Makefile `help` target to describe `test-e2e-live`

#### Phase 2: Live helpers module (~15%)

**File:** `tests/e2e-live/helpers/liveHelpers.ts`

**Tasks:**
- [ ] `isBinaryInstalled(cmd: string): boolean` — `execSync("which <cmd>")`, returns false on error
- [ ] `resolveApiKey(envVar: string): string | undefined` — returns `process.env[envVar]?.trim()` or undefined if empty/absent
- [ ] `openSidebar(page: Page): Promise<void>` — click RIBBON_OPEN_SIDEBAR, wait for SIDEBAR_ROOT
- [ ] `navigateToPluginSettings(page: Page): Promise<void>` — wait for `.vertical-tab-header`, click "AI Agent Sidebar" tab, wait 500ms
- [ ] `sendChatMessage(page: Page, text: string): Promise<void>` — click CHAT_INPUT, fill, press Enter
- [ ] `waitForAssistantMessageComplete(page: Page, timeoutMs?: number): Promise<void>` — wait for `CHAT_MSG_ASSISTANT:not(.ai-sidebar-message--streaming)` visible; default 60 s
- [ ] `buildFileCreatePrompt(filename: string): string` — returns explicit :::file-op block prompt
- [ ] `pollForFile(vaultPath: string, filename: string, timeoutMs?: number): Promise<void>` — polls `fs.existsSync` every 500 ms, throws `Error` with clear message after timeout (default 10 s); after file is found, read it and assert it contains `"Created by live E2E test."` (semantic check, not just existence)
- [ ] `saveFailureScreenshot(page: Page, ctx: any, prefix: string): Promise<void>` — saves to `tests/e2e-live/artifacts/`
- [ ] Add comment in `liveHelpers.ts` next to `isBinaryInstalled`: `// cmd must be a trusted constant — never pass user-controlled input`
- [ ] Add comment in `buildFileCreatePrompt`: `// filename is hardcoded per describe block; do not accept user-controlled filenames`

#### Phase 3: CLI agents live test file (~35%)

**File:** `tests/e2e-live/cli-agents.e2e-live.test.ts`

Three describe blocks following identical structure for claude, codex, copilot:

```
describe("live-e2e: <agent> CLI") {
  beforeAll:
    1. skip if !findObsidianBinary()
    2. skip if !isBinaryInstalled("<cmd>")
    3. createTestVault({ <agentId>: { enabled: true, yoloMode: true, accessMode: "cli" } })
    4. launchObsidian(binary, vault.vaultPath)
    5. openSidebar(page), click TAB_BTN_<AGENT>
  afterEach: saveFailureScreenshot
  afterAll: quitObsidian, vault.cleanup

  it("sends a simple message and receives a response")
    → sendChatMessage(page, "Say hello briefly.")
    → waitForAssistantMessageComplete(page)

  it("creates a file in the vault via the file-op protocol")
    → const filename = "live-e2e-cli-<agent>.md"
    → sendChatMessage(page, buildFileCreatePrompt(filename))
    → waitForAssistantMessageComplete(page, 90_000)
    → pollForFile(vault.vaultPath, filename)
}
```

**Tasks:**
- [ ] `describe("live-e2e: claude CLI")` — cmd: `claude`, agentId: `claude`, tab: `TAB_BTN_CLAUDE`, filename: `live-e2e-cli-claude.md`
- [ ] `describe("live-e2e: codex CLI")` — cmd: `codex`, agentId: `codex`, tab: `TAB_BTN_CODEX`, filename: `live-e2e-cli-codex.md`
- [ ] `describe("live-e2e: copilot CLI")` — cmd: `copilot`, agentId: `copilot`, tab: `TAB_BTN_COPILOT`, filename: `live-e2e-cli-copilot.md`
- [ ] All describes: screenshot artifacts to `tests/e2e-live/artifacts/` with prefix `fail-cli-<agent>`
- [ ] Verify: `make test-e2e` does NOT pick up this file (glob isolation confirmed by directory structure)

#### Phase 4: API agents live test file (~35%)

**File:** `tests/e2e-live/api-agents.e2e-live.test.ts`

Three describe blocks for claude, codex, gemini:

```
describe("live-e2e: <agent> API") {
  beforeAll:
    1. skip if !findObsidianBinary()
    2. skip if !resolveApiKey("<PROVIDER_API_KEY_VAR>")
    3. createTestVault({ <agentId>: { enabled: true, accessMode: "api" } })
       NOTE: NO apiKey override in data.json — let plugin read from shell env
    4. launchObsidian(binary, vault.vaultPath, { keepSettingsOpen: true })
    5. navigateToPluginSettings(page)
  afterEach: saveFailureScreenshot
  afterAll: quitObsidian, vault.cleanup

  it("model select shows multiple real models from live API fetch")
    → wait for MODEL_FIELD_<AGENT> select visible (30 s)
    → assert options.length > 2
    → assert no "could not fetch models" text in SETTINGS_SECTION_<PROVIDER>

  it("sends a simple message and receives a response")
    → page.keyboard.press("Escape") to close settings
    → openSidebar(page), click TAB_BTN_<AGENT>
    → sendChatMessage(page, "Say hello briefly.")
    → waitForAssistantMessageComplete(page)

  it("creates a file in the vault via the file-op protocol")
    → const filename = "live-e2e-api-<agent>.md"
    → sendChatMessage(page, buildFileCreatePrompt(filename))
    → waitForAssistantMessageComplete(page, 90_000)
    → pollForFile(vault.vaultPath, filename)
}
```

**Tasks:**
- [ ] `describe("live-e2e: claude API")` — env: `ANTHROPIC_API_KEY`, agentId: `claude`, section: `SETTINGS_SECTION_ANTHROPIC`, model: `MODEL_FIELD_CLAUDE`, tab: `TAB_BTN_CLAUDE`, filename: `live-e2e-api-claude.md`
- [ ] `describe("live-e2e: codex API")` — env: `OPENAI_API_KEY`, agentId: `codex`, section: `SETTINGS_SECTION_OPENAI`, model: `MODEL_FIELD_CODEX`, tab: `TAB_BTN_CODEX`, filename: `live-e2e-api-codex.md`
- [ ] `describe("live-e2e: gemini API")` — env: `GEMINI_API_KEY` (or `GOOGLE_API_KEY`), agentId: `gemini`, section: `SETTINGS_SECTION_GOOGLE`, model: `MODEL_FIELD_GEMINI`, tab: `TAB_BTN_GEMINI`, filename: `live-e2e-api-gemini.md`
- [ ] All describes: screenshot artifacts to `tests/e2e-live/artifacts/` with prefix `fail-api-<agent>`
- [ ] Model-list test: uses `waitFor` with 30 s timeout before asserting count (not a race condition)
- [ ] Verify: `make test-e2e` does NOT pick up this file

#### Phase 5: Documentation (~5%)

**Files:** `tests/e2e-live/README.md`, `CLAUDE.md`

**Tasks:**
- [ ] Create `tests/e2e-live/README.md`:
  - Prerequisites: Obsidian installed; claude/codex/copilot CLIs installed; `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` in shell env; valid subscriptions on all accounts
  - Run command: `make test-e2e-live`
  - Expected runtime: 3–8 minutes depending on LLM latency
  - Note: tests are sequential (one Obsidian launch per describe); Obsidian must not be running
  - Note: copilot CLI file-create test may be less reliable than claude/codex if copilot does not consistently follow the :::file-op protocol
  - Artifacts: failure screenshots saved to `tests/e2e-live/artifacts/` (not committed)
- [ ] Update `CLAUDE.md` build section:
  - Add `make test-e2e-live   # live E2E tests (requires real CLIs + API keys, NOT part of make test)`
- [ ] Add `tests/e2e-live/artifacts/` to `.gitignore` (screenshots may contain sensitive chat content)

### P1: Ship If Capacity Allows

- [ ] **Gemini API key fallback**: check `GEMINI_API_KEY` then `GOOGLE_API_KEY` then `GOOGLE_GENERATIVE_AI_API_KEY` — matches how the plugin resolves Gemini keys via shellEnv.ts
- [ ] **Content verification for file-create**: after `pollForFile`, also read the file and assert it contains `"Created by live E2E test."` — stronger proof than existence alone
- [ ] **Explicit copilot note in test comment**: add inline comment noting that copilot file-create is the highest-risk test due to CLI protocol compliance uncertainty

### Deferred

- Error path tests (invalid credentials, network timeout) — covered by mock E2E; live error paths are environment-sensitive
- Cross-platform live testing (Windows, Linux) — macOS-only scope
- Live test CI integration — requires secrets management; out of scope
- openai-compat live tests — explicitly excluded by seed

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `vitest.e2e-live.config.ts` | Create | Vitest config: node env, `tests/e2e-live/**/*.e2e-live.test.ts`, 120 s timeout, sequential |
| `package.json` | Modify | Add `"test-e2e-live"` script |
| `Makefile` | Modify | Add `test-e2e-live` target (depends on `build`); add to `.PHONY`; update `help` |
| `tests/e2e-live/helpers/liveHelpers.ts` | Create | Binary check, API key check, chat helpers, file poll, screenshot helper |
| `tests/e2e-live/cli-agents.e2e-live.test.ts` | Create | Live CLI tests: claude, codex, copilot (chat + file-create per agent) |
| `tests/e2e-live/api-agents.e2e-live.test.ts` | Create | Live API tests: claude, codex, gemini (model-list + chat + file-create per agent) |
| `tests/e2e-live/README.md` | Create | Prerequisites, run command, expected runtime, known limitations |
| `CLAUDE.md` | Modify | Add `make test-e2e-live` to build section |

## Definition of Done

- [ ] `npm run build` passes — no TypeScript errors
- [ ] `vitest.e2e-live.config.ts` exists with correct include pattern, timeout, and sequential config
- [ ] `npm run test-e2e-live` runs the live suite
- [ ] `make test-e2e-live` builds plugin then runs live suite
- [ ] `make test` is unchanged — running it does NOT invoke live tests (verified by checking target composition)
- [ ] `tests/e2e-live/helpers/liveHelpers.ts` exports: `isBinaryInstalled`, `resolveApiKey`, `openSidebar`, `navigateToPluginSettings`, `sendChatMessage`, `waitForAssistantMessageComplete`, `buildFileCreatePrompt`, `pollForFile`, `saveFailureScreenshot`
- [ ] `cli-agents.e2e-live.test.ts` has 3 describe blocks (claude, codex, copilot) each with 2 tests (chat + file-create)
- [ ] `api-agents.e2e-live.test.ts` has 3 describe blocks (claude, codex, gemini) each with 3 tests (model-list + chat + file-create)
- [ ] Each CLI describe: `beforeAll` skips on `!binary`, `!isBinaryInstalled("<cmd>")`, and `ObsidianLaunchError`
- [ ] Each API describe: `beforeAll` skips on `!binary`, `!resolveApiKey(...)`, and `ObsidianLaunchError`
- [ ] CLI vaults pre-seeded: `{ enabled: true, yoloMode: true, accessMode: "cli" }` — no apiKey in data.json
- [ ] API vaults pre-seeded: `{ enabled: true, accessMode: "api" }` — no apiKey in data.json (shell env resolution)
- [ ] `buildFileCreatePrompt(filename)` produces a prompt with literal :::file-op write block embedded
- [ ] `pollForFile` polls every 500 ms, throws after 10 s with a clear message
- [ ] Model-list assertion: `options.length > 2` AND no "could not fetch models" text in settings section
- [ ] Model-list test uses `waitFor` 30 s before asserting (no race against live API fetch)
- [ ] Model-list test verifies at least one option value matches provider-specific name pattern: claude→`/claude-/i`, codex→`/gpt-|^o\d/i`, gemini→`/gemini-/i`
- [ ] Screenshot artifacts saved to `tests/e2e-live/artifacts/` in `afterEach` on failure
- [ ] `afterAll` in every describe calls `quitObsidian(app)` and `vault?.cleanup()`
- [ ] Import paths from `tests/e2e-live/` use `../e2e/helpers/` (not `../../e2e/helpers/`)
- [ ] Existing `tests/e2e/**/*.e2e.test.ts` glob does NOT match any file in `tests/e2e-live/`
- [ ] `tests/e2e-live/README.md` exists with prerequisites, run command, runtime estimate, copilot note
- [ ] `CLAUDE.md` updated with `make test-e2e-live`
- [ ] `pollForFile` asserts file content contains `"Created by live E2E test."` (not just existence)
- [ ] Model-list assertion verifies at least one option value matches provider-specific model name pattern (claude: `/claude-/i`, codex: `/gpt-|^o\d/i`, gemini: `/gemini-/i`)
- [ ] `tests/e2e-live/artifacts/` added to `.gitignore` (screenshots may contain sensitive chat content)
- [ ] On a machine with all prerequisites configured (Obsidian, all CLIs, all API keys), all 6 describe blocks execute and pass — none skip (verified manually before sprint close)
- [ ] No production source files modified
- [ ] No new npm packages

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Live LLM doesn't output :::file-op block | Medium | Medium | Prompt embeds the literal block for agent to echo; reduces compliance variance |
| `pollForFile` times out before file is created | Low | Medium | 10 s polling window is generous; if file isn't created in 10 s after response completes, the agent failed to follow the protocol |
| Copilot CLI unreliable for file-op protocol | Medium | Low | Test will fail with clear `pollForFile` timeout; documented in README as known limitation |
| API model fetch > 30 s (cold start) | Low | Low | 30 s `waitFor` on model select; test will fail with a Playwright timeout if exceeded |
| Obsidian already running when test starts | Low | High | `isObsidianRunning()` in electronHarness throws `ObsidianLaunchError` → describe skips |
| Live tests run in CI without credentials | Low | Low | All describes skip when Obsidian binary absent; `make test` doesn't include live target |
| `GEMINI_API_KEY` env var name inconsistency | Medium | Low | P1 item: check multiple Gemini env var names before skipping; fallback to `GOOGLE_API_KEY` |

## Security Considerations

- **No credentials embedded in files**: API agents rely on shell env vars. No keys appear in `data.json`, test files, or commit history.
- **yoloMode vault isolation**: yoloMode is only set in temp vaults created in `os.tmpdir()`. Each vault is destroyed in `afterAll`. No risk of enabling yoloMode in the user's production vault.
- **Artifacts may contain chat content**: Screenshots in `tests/e2e-live/artifacts/` could contain chat response text. Add `tests/e2e-live/artifacts/` to `.gitignore` if not already covered by `*.png` or similar rules.
- **No mock server**: Live tests hit real external APIs. All traffic goes to provider endpoints over HTTPS. No local open ports.

## Observability & Rollback

- **Post-ship verification**: Run `make test-e2e-live` on a machine with all prerequisites. All 6 describe blocks pass → full stack verified with real agents. Any describe that skips → prerequisite missing on that machine (expected, not a failure).
- **Rollback**: All changes are test files and config. Delete `tests/e2e-live/`, `vitest.e2e-live.config.ts`, and revert `package.json`, `Makefile`, `CLAUDE.md` to restore prior state. Zero impact on production plugin.

## Documentation

- [ ] Create `tests/e2e-live/README.md` with prerequisites and run instructions
- [ ] Update `CLAUDE.md` build section to include `make test-e2e-live`

## Dependencies

- Sprints 001–007 complete: electronHarness, vaultFactory, selectors, obsidianBinary all stable
- No new npm packages
- Obsidian desktop app installed on test machine (skip if absent)
- `claude`, `codex`, `copilot` CLIs installed (or CLI describes skip)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` in shell env (or API describes skip)

## Devil's Advocate Critiques Addressed

*From Codex's devil's advocate review:*

- **File existence without semantic validation**: `pollForFile` now also reads the file and asserts it contains `"Created by live E2E test."` ✓
- **`options.length > 2` is a weak proxy for live fetch**: Added provider-specific model name pattern assertion (`/claude-/i`, `/gpt-|^o\d/i`, `/gemini-/i`) ✓
- **Artifact hygiene**: Added `.gitignore` DoD item for `tests/e2e-live/artifacts/` ✓
- **Skip-heavy design**: Added DoD item requiring all 6 describes to execute (not skip) on a fully-configured machine ✓

*Critiques rejected:*

- **"Activity not correctness"**: Live LLM responses are non-deterministic; "non-empty + file created" is the correct bar for a smoke-test live suite. We cannot assert specific content in an LLM response. ✓ (rejected)
- **yoloMode as permissive-only path**: yoloMode is required for CLI file creation; testing without it would not satisfy the sprint's stated goal. ✓ (rejected)
- **Shell env fragility in Electron**: Used successfully in 3 prior sprints of API E2E; same mechanism as production code. ✓ (rejected)
- **openai-compat exclusion**: Explicitly excluded by seed requirements. ✓ (rejected)
- **Retry policy**: Retry would hide flakiness; test failure is the correct signal for live test instability. ✓ (rejected)
- **No negative-path live testing**: Mock E2E already covers error paths; deferred deliberately. ✓ (rejected)

## Open Questions

None. Both interview answers confirmed draft defaults. Prereq skip patterns and model-assertion improvements incorporated from Codex critique. Devil's advocate improvements incorporated above.
