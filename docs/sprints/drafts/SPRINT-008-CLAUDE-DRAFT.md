# Sprint 008: Live E2E Tests

## Overview

Seven sprints built a feature-complete plugin and a full mock-based test pyramid. Every layer — unit, integration, and E2E — has been verified against stubbed or mocked external services. The one remaining gap is proof that the plugin works against *real* CLIs and real APIs: the live E2E suite.

This sprint creates a separate `tests/e2e-live/` directory with tests that assume real credentials and CLIs are available on the developer's machine. They are deliberately excluded from `make test` and run only via an explicit `make test-e2e-live` command. The tests reuse all existing infrastructure (electronHarness, vaultFactory, selectors, obsidianBinary) without modification.

Coverage spans six scenarios: three CLI agents (claude, codex, copilot) each with a simple chat test and a file-creation test (yoloMode enabled), and three API agents (claude, codex, gemini in API mode) each with a model-list verification, a chat test, and a file-creation test.

## Use Cases

1. **Claude CLI — chat**: Enable claude in CLI mode with yoloMode; send "Say hello briefly"; verify a non-empty, non-error response appears.
2. **Claude CLI — file create**: Send a prompt asking the agent to write `live-e2e-cli-claude.md`; verify the file exists in the vault filesystem.
3. **Codex CLI — chat**: Same as (1) for codex.
4. **Codex CLI — file create**: Same as (2) for codex (`live-e2e-cli-codex.md`).
5. **Copilot CLI — chat**: Same for copilot.
6. **Copilot CLI — file create**: Same for copilot (`live-e2e-cli-copilot.md`).
7. **Claude API — model list**: Open settings with claude in API mode; verify model select has > 2 options (real models loaded from Anthropic API).
8. **Claude API — chat**: Send "Say hello briefly"; verify response.
9. **Claude API — file create**: Ask agent to create `live-e2e-api-claude.md`; verify it exists.
10. **Codex API — model list**: Same for codex (OpenAI).
11. **Codex API — chat**: Same for codex.
12. **Codex API — file create**: Same for codex (`live-e2e-api-codex.md`).
13. **Gemini API — model list**: Same for gemini (Google).
14. **Gemini API — chat**: Same for gemini.
15. **Gemini API — file create**: Same for gemini (`live-e2e-api-gemini.md`).

## Architecture

```
tests/e2e-live/
├── cli-agents.e2e-live.test.ts   ← 3 describe blocks (claude, codex, copilot CLI)
└── api-agents.e2e-live.test.ts   ← 3 describe blocks (claude, codex, gemini API)

vitest.e2e-live.config.ts         ← new; mirrors vitest.e2e.config.ts but for e2e-live pattern

Both test files import helpers from tests/e2e/helpers/ via relative paths (no duplication):
  ../../e2e/helpers/electronHarness
  ../../e2e/helpers/vaultFactory
  ../../e2e/helpers/selectors
  ../../e2e/helpers/obsidianBinary

package.json:   + "test-e2e-live" script
Makefile:       + test-e2e-live target (NOT in test or test aggregate)
```

### Key Design Decisions

**Per-describe vault**: Each describe block creates its own temp vault in `beforeAll` and cleans it up in `afterAll`. Vaults differ by agent (only one agent enabled per describe), so they cannot be shared.

**yoloMode for CLI agents**: All three CLI describe blocks pre-seed `yoloMode: true`. This adds `--dangerously-skip-permissions` (claude), `--full-auto` (codex), and `--allow-all` (copilot) so agents don't prompt for permission when creating files.

**API key source**: API agents are pre-seeded with `enabled: true, accessMode: "api"` but NO `apiKey` override in `data.json`. The plugin resolves the real key from shell env (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` or their namespaced variants) at runtime. This mirrors production behavior.

**Model list check**: Open the settings panel with `keepSettingsOpen: true`. Navigate to plugin settings. Find the `<select>` inside the model field container. Assert `options.length > 2`.

**File creation via :::file-op**: The prompt asks the agent to create a specific file using the file-op protocol. The system prompt already instructs agents to use this protocol for vault operations. After the assistant message completes (non-streaming class), poll `fs.existsSync(vaultFilePath)` for up to 5 s.

**File creation prompt template**:
```
Create a file called `<filename>` in the vault using the file-op protocol:
:::file-op
{"op":"write","path":"<filename>","content":"Created by live E2E test."}
:::
Respond only with the file-op block above and a brief confirmation.
```
This explicit prompt avoids relying on the agent to independently decide to use the protocol.

## Implementation Plan

### P0: Must Ship

#### Phase 1: vitest config and build wiring (~10%)

**Files:**
- `vitest.e2e-live.config.ts` — new
- `package.json` — add script
- `Makefile` — add target

**Tasks:**
- [ ] Create `vitest.e2e-live.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";
  export default defineConfig({
    test: {
      environment: "node",
      include: ["tests/e2e-live/**/*.e2e-live.test.ts"],
      testTimeout: 120_000,   // live LLMs slower than mocks
      hookTimeout: 90_000,
      fileParallelism: false, // sequential; Obsidian is single-instance on macOS
      reporters: ["verbose"],
    },
  });
  ```
- [ ] Add `"test-e2e-live": "vitest run --config vitest.e2e-live.config.ts"` to `package.json` scripts
- [ ] Add to `Makefile`:
  ```makefile
  test-e2e-live: build
  	npm run test-e2e-live
  ```
- [ ] Add `test-e2e-live` to `.PHONY`
- [ ] **Do NOT** add `test-e2e-live` to the `test` target or any aggregate target
- [ ] Update `help` target description to mention `test-e2e-live`

#### Phase 2: CLI agents live test file (~40%)

**Files:**
- `tests/e2e-live/cli-agents.e2e-live.test.ts` — new

**Structure** (one `describe` per agent, repeated 3×):
```ts
describe("live-e2e: <agent> CLI", () => {
  const binary = findObsidianBinary();
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async (ctx) => {
    if (!binary) { ctx.skip(); return; }
    vault = await createTestVault({
      <agentId>: { enabled: true, yoloMode: true, accessMode: "cli" },
    });
    try {
      ({ app, page } = await launchObsidian(binary, vault.vaultPath));
    } catch (err) {
      if (err instanceof ObsidianLaunchError) { ctx.skip(); return; }
      throw err;
    }
    await openSidebar(page);
    // Click agent tab if it's not automatically active
    await page.locator(TAB_BTN_<AGENT>).waitFor({ state: "visible", timeout: 10_000 });
    await page.locator(TAB_BTN_<AGENT>).click();
  });

  afterEach(async (ctx) => { /* screenshot on failure */ });
  afterAll(async () => { await quitObsidian(app); await vault?.cleanup(); });

  it("sends a simple message and receives a response", async () => {
    await sendChatMessage(page, "Say hello briefly.");
    await waitForAssistantMessage(page, 60_000);
  });

  it("creates a file in the vault via the file-op protocol", async () => {
    const filename = "live-e2e-cli-<agent>.md";
    await sendChatMessage(page, buildFileCreatePrompt(filename));
    await waitForAssistantMessageComplete(page, 60_000);
    await pollForFile(vault.vaultPath, filename, 10_000);
  });
});
```

**Helper functions** (defined at file top):
- `sendChatMessage(page, text)` — click CHAT_INPUT, fill, press Enter
- `openSidebar(page)` — click RIBBON_OPEN_SIDEBAR, wait for SIDEBAR_ROOT
- `waitForAssistantMessageComplete(page, timeout)` — wait for `CHAT_MSG_ASSISTANT:not(.ai-sidebar-message--streaming)` to be visible
- `buildFileCreatePrompt(filename)` — returns the explicit :::file-op create prompt template
- `pollForFile(vaultPath, filename, timeoutMs)` — polls `fs.existsSync` every 500 ms, throws after timeout

**Tasks:**
- [ ] Implement `buildFileCreatePrompt(filename: string): string`:
  ```ts
  function buildFileCreatePrompt(filename: string): string {
    return (
      `Create a file called \`${filename}\` in the vault using the file-op protocol:\n` +
      `:::file-op\n` +
      `{"op":"write","path":"${filename}","content":"Created by live E2E test."}\n` +
      `:::\n` +
      `Respond only with the file-op block above and a brief confirmation.`
    );
  }
  ```
- [ ] Implement `pollForFile(vaultPath: string, filename: string, timeoutMs: number): Promise<void>`
- [ ] `describe("live-e2e: claude CLI")` — agent `claude`, tab `TAB_BTN_CLAUDE`, filename `live-e2e-cli-claude.md`
- [ ] `describe("live-e2e: codex CLI")` — agent `codex`, tab `TAB_BTN_CODEX`, filename `live-e2e-cli-codex.md`
- [ ] `describe("live-e2e: copilot CLI")` — agent `copilot`, tab `TAB_BTN_COPILOT`, filename `live-e2e-cli-copilot.md`
- [ ] Screenshot-on-failure in `afterEach` for all describes; artifacts saved to `tests/e2e-live/artifacts/`
- [ ] Guard: each `beforeAll` skips if `!binary` or if `ObsidianLaunchError` is thrown

#### Phase 3: API agents live test file (~40%)

**Files:**
- `tests/e2e-live/api-agents.e2e-live.test.ts` — new

**Structure** (one `describe` per API agent):
```ts
describe("live-e2e: <agent> API", () => {
  const binary = findObsidianBinary();
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async (ctx) => {
    if (!binary) { ctx.skip(); return; }
    vault = await createTestVault({
      <agentId>: { enabled: true, accessMode: "api" },
    });
    try {
      ({ app, page } = await launchObsidian(binary, vault.vaultPath, { keepSettingsOpen: true }));
    } catch (err) {
      if (err instanceof ObsidianLaunchError) { ctx.skip(); return; }
      throw err;
    }
    // Navigate to plugin settings tab
    await navigateToPluginSettings(page);
  });

  afterEach(async (ctx) => { /* screenshot on failure */ });
  afterAll(async () => { await quitObsidian(app); await vault?.cleanup(); });

  it("model select shows multiple real models (> 2)", async () => {
    const modelSelect = page.locator(`${MODEL_FIELD_<AGENT>} select`);
    await modelSelect.waitFor({ state: "visible", timeout: 30_000 });
    const count = await modelSelect.evaluate((el: HTMLSelectElement) => el.options.length);
    expect(count).toBeGreaterThan(2);
  });

  it("sends a simple message and receives a response", async () => {
    // Close settings and open sidebar
    await page.keyboard.press("Escape");
    await openSidebar(page);
    await page.locator(TAB_BTN_<AGENT>).click();
    await sendChatMessage(page, "Say hello briefly.");
    await waitForAssistantMessageComplete(page, 60_000);
  });

  it("creates a file in the vault via the file-op protocol", async () => {
    const filename = "live-e2e-api-<agent>.md";
    await sendChatMessage(page, buildFileCreatePrompt(filename));
    await waitForAssistantMessageComplete(page, 60_000);
    await pollForFile(vault.vaultPath, filename, 10_000);
  });
});
```

**Helper function** (shared):
- `navigateToPluginSettings(page)` — wait for `.vertical-tab-header`, click "AI Agent Sidebar" tab

**Tasks:**
- [ ] Implement `navigateToPluginSettings(page: Page): Promise<void>`
- [ ] `describe("live-e2e: claude API")` — agent `claude`, `MODEL_FIELD_CLAUDE`, tab `TAB_BTN_CLAUDE`, filename `live-e2e-api-claude.md`
- [ ] `describe("live-e2e: codex API")` — agent `codex`, `MODEL_FIELD_CODEX`, tab `TAB_BTN_CODEX`, filename `live-e2e-api-codex.md`
- [ ] `describe("live-e2e: gemini API")` — agent `gemini`, `MODEL_FIELD_GEMINI`, tab `TAB_BTN_GEMINI`, filename `live-e2e-api-gemini.md`
- [ ] Screenshot-on-failure in `afterEach`; artifacts to `tests/e2e-live/artifacts/`
- [ ] Guard: each `beforeAll` skips if `!binary` or `ObsidianLaunchError`

#### Phase 4: Documentation (~10%)

- [ ] Add `tests/e2e-live/README.md`:
  - Prerequisites: Obsidian installed, claude CLI installed, codex CLI installed, copilot CLI installed, API keys in shell env (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`)
  - How to run: `make test-e2e-live`
  - What each describe block tests
  - Note: these tests use real external services; expect 2-5 minutes total run time
- [ ] Update `CLAUDE.md` build section to mention `make test-e2e-live`

### P1: Ship If Capacity Allows

- [ ] **Shared helpers module**: Extract `sendChatMessage`, `openSidebar`, `waitForAssistantMessageComplete`, `buildFileCreatePrompt`, `pollForFile` into `tests/e2e-live/helpers/liveE2eHelpers.ts` to avoid duplication between cli and api test files — only if both files are written and duplication is notable.

### Deferred

- Error path tests for live agents (e.g., bad API key → error in chat) — covered by mock E2E; not needed in live suite
- Cross-platform testing (Windows, Linux) — macOS-only per existing E2E scope
- Performance/latency assertions — not appropriate for live tests
- Live model list verification for openai-compat — explicitly out of scope per seed

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `vitest.e2e-live.config.ts` | Create | Vitest config for live E2E tests; 120 s timeout; sequential |
| `package.json` | Modify | Add `"test-e2e-live"` script |
| `Makefile` | Modify | Add `test-e2e-live` target (depends on `build`); add to `.PHONY`; update `help` |
| `tests/e2e-live/cli-agents.e2e-live.test.ts` | Create | Claude/Codex/Copilot CLI: chat + file-create live tests |
| `tests/e2e-live/api-agents.e2e-live.test.ts` | Create | Claude/Codex/Gemini API: model-list + chat + file-create live tests |
| `tests/e2e-live/README.md` | Create | Prerequisites and run instructions |
| `CLAUDE.md` | Modify | Add `make test-e2e-live` to build section |

## Definition of Done

- [ ] `npm run build` passes — no TypeScript errors
- [ ] `vitest.e2e-live.config.ts` exists and runs `tests/e2e-live/**/*.e2e-live.test.ts`
- [ ] `make test-e2e-live` triggers a build then runs the live suite
- [ ] `make test` is unchanged — running `make test` does NOT invoke live tests
- [ ] `tests/e2e-live/cli-agents.e2e-live.test.ts` exists with 3 describe blocks (claude, codex, copilot CLI)
- [ ] `tests/e2e-live/api-agents.e2e-live.test.ts` exists with 3 describe blocks (claude, codex, gemini API)
- [ ] Each describe block has: `it("sends a simple message...")` + `it("creates a file in the vault...")`; API blocks additionally have `it("model select shows multiple real models")`
- [ ] CLI describe blocks pre-seed `yoloMode: true` in vaultFactory
- [ ] API describe blocks pre-seed `accessMode: "api"` but NO `apiKey` override (use shell env)
- [ ] `buildFileCreatePrompt(filename)` uses explicit :::file-op block in the prompt text
- [ ] `pollForFile(vaultPath, filename, 10_000)` polls `fs.existsSync` every 500 ms and throws after timeout
- [ ] Model list test asserts `el.options.length > 2` on the `<select>` inside `MODEL_FIELD_*`
- [ ] All describes skip gracefully when Obsidian binary absent (`!binary → ctx.skip()`)
- [ ] All describes skip on `ObsidianLaunchError` in `beforeAll`
- [ ] Screenshot-on-failure in `afterEach` saves to `tests/e2e-live/artifacts/`
- [ ] `afterAll` calls `quitObsidian` + `vault.cleanup()` in every describe block
- [ ] `testTimeout: 120_000` and `hookTimeout: 90_000` in vitest config
- [ ] `fileParallelism: false` in vitest config
- [ ] `tests/e2e-live/README.md` documents prerequisites and run command
- [ ] `CLAUDE.md` updated with `make test-e2e-live` command

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Live LLM doesn't output :::file-op block exactly | Medium | Medium | Use explicit prompt with the literal file-op block embedded; if agent paraphrases, `pollForFile` timeout triggers a clear failure message |
| Codex CLI `--full-auto` flag doesn't exist or changed | Low | Low | Sprint test will show the error; adapt yoloArgs in AgentRunner if needed |
| Copilot CLI doesn't understand the :::file-op protocol | Medium | Low | The system prompt explains the protocol; if copilot can't be relied on for file-create, that test documents the limitation |
| Obsidian already running when test starts | Low | High | Existing `isObsidianRunning()` check in electronHarness throws `ObsidianLaunchError` → describe skips |
| API model list takes > 30 s to populate (cold start) | Low | Low | 30 s waitFor timeout on model select is generous for real API calls |
| Tests run in CI without credentials | Low | Low | `ctx.skip()` guard; CI would skip all describes if binary absent anyway |

## Security Considerations

- **No credentials embedded**: API agents rely on shell env vars; no keys in any file committed to git.
- **yoloMode in test vault only**: The temp vault is destroyed in `afterAll`. yoloMode flag only affects the isolated test Obsidian instance.
- **Loopback not used**: Live tests hit real external APIs. No `127.0.0.1` mock server to misconfigure.
- **Vault isolation**: Each test creates a fresh temp vault in `os.tmpdir()`; cleaned up after. No risk of polluting the user's real vault.
- **Screenshot artifacts**: Saved to `tests/e2e-live/artifacts/`; may contain chat response text. Not committed to git (add to `.gitignore` if not already).

## Observability & Rollback

- **Post-ship verification**: Run `make test-e2e-live` on a machine with all prerequisites. If all 6 describe blocks pass, the live E2E suite is verified end-to-end.
- **Rollback**: All changes are test files and config. Deleting the new files and reverting `package.json` / `Makefile` / `CLAUDE.md` restores prior state with zero production impact.

## Documentation

- [ ] Create `tests/e2e-live/README.md` with prerequisites, run command, and describe-block inventory
- [ ] Update `CLAUDE.md` to add `make test-e2e-live` to the build section

## Dependencies

- Sprint 004–007 complete: electronHarness, vaultFactory, selectors, obsidianBinary all stable
- No new npm packages
- Obsidian desktop app installed on test machine
- `claude`, `codex`, `copilot` CLIs installed (or tests skip)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` in shell env (or API tests skip their meaningful assertions)

## Open Questions

1. Should the file-creation test verify file *content* as well as existence? (Low value; existence check is sufficient proof the plugin executed the file-op.)
2. For the API model-list test: should we wait for the model select to have options, or just assert it's visible and has > 2? (Wait + assert — avoid flakiness from slow API.)
3. Does copilot CLI support the :::file-op protocol well enough for a reliable live test? This is the highest-risk scenario and should be noted in the README as "may require manual verification."
