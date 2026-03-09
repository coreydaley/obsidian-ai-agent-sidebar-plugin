# Sprint 009: Live E2E — OpenAI-Compatible Agent (Docker)

## Overview

Sprint 008 completed live E2E tests for all planned agents — CLI (claude, codex, copilot) and API (claude, codex, gemini) — but explicitly deferred the OpenAI-compatible agent. This sprint closes that gap by adding `tests/e2e-live/openai-compat.e2e-live.test.ts` and a `make test-e2e-openai-compatible` target.

The distinguishing challenge is infrastructure: unlike other live tests that assume pre-installed CLIs or shell env API keys, this test must start and stop a Docker container running a real (tiny) OpenAI-compatible LLM. Docker lifecycle is managed entirely inside the test's `beforeAll`/`afterAll` hooks so the Makefile target remains a clean `build → run tests` invocation.

The selected Docker approach is `ollama/ollama:latest` with the `smollm2:135m` model (~90MB, ~400–600 MB RAM, no GPU required). The vault is pre-seeded with `openaiCompatBaseUrl` and `selectedModel` so no Obsidian UI interaction is needed to configure the agent. Two tests verify the full flow: a simple chat message receives a non-error response, and a file-op prompt creates a file in the vault.

## Use Cases

1. **Docker lifecycle**: `beforeAll` starts an Ollama container, pulls `smollm2:135m`, waits for the endpoint to be healthy; `afterAll` stops and removes the container.
2. **Chat**: Send "Say hello briefly." to the openai-compat tab; `waitForAssistantMessageComplete` passes; no error card visible.
3. **File creation**: Send the `:::file-op write` prompt; file appears in vault with correct content.
4. **Skip guards**: Suite skips gracefully when Docker is not available, Obsidian binary is absent, or when the `SKIP_OPENAI_COMPAT` / `SKIP_API` env vars are set.

## Architecture

```
New files:
  tests/e2e-live/helpers/dockerHelpers.ts          Docker lifecycle: start, pull model, wait-ready, stop
  tests/e2e-live/openai-compat.e2e-live.test.ts    1 describe block: chat + file-create

Modified files:
  package.json     add "test-e2e-openai-compatible" script
  Makefile         add test-e2e-openai-compatible target; update .PHONY and help
  CLAUDE.md        add make test-e2e-openai-compatible to build section

Imports (new test file → existing helpers):
  tests/e2e-live/openai-compat.e2e-live.test.ts → ../e2e/helpers/electronHarness
  tests/e2e-live/openai-compat.e2e-live.test.ts → ../e2e/helpers/vaultFactory
  tests/e2e-live/openai-compat.e2e-live.test.ts → ../e2e/helpers/selectors
  tests/e2e-live/openai-compat.e2e-live.test.ts → ../e2e/helpers/obsidianBinary
  tests/e2e-live/openai-compat.e2e-live.test.ts → ./helpers/liveHelpers
  tests/e2e-live/openai-compat.e2e-live.test.ts → ./helpers/dockerHelpers
```

### Docker Helpers Module

```typescript
// tests/e2e-live/helpers/dockerHelpers.ts

export const OLLAMA_CONTAINER_NAME = "obsidian-e2e-ollama";
export const OLLAMA_PORT = 11434;
export const OLLAMA_MODEL = "smollm2:135m";
export const OLLAMA_BASE_URL = `http://127.0.0.1:${OLLAMA_PORT}/v1`;

// Returns true when the `docker` CLI is accessible
export function isDockerAvailable(): boolean

// Starts the Ollama container; if a container with the same name already exists,
// removes it first (cleanup from a previous interrupted run)
export async function startOllamaContainer(): Promise<void>

// Pulls smollm2:135m inside the running container
// Runs `docker exec obsidian-e2e-ollama ollama pull smollm2:135m`
export async function pullOllamaModel(): Promise<void>

// Polls GET http://127.0.0.1:11434/api/tags until the model appears in the list
// or timeoutMs is exceeded (default 120_000 ms)
export async function waitForOllamaReady(timeoutMs?: number): Promise<void>

// Stops and removes the container; resolves even if already stopped/absent
export async function stopOllamaContainer(): Promise<void>
```

### Test Structure

```typescript
describe.skipIf(shouldSkipSuite("api", "openai-compat"))("live-e2e: openai-compat", () => {
  beforeAll:
    1. if (!findObsidianBinary()) throw
    2. if (!isDockerAvailable()) throw
    3. await startOllamaContainer()
    4. await pullOllamaModel()
    5. await waitForOllamaReady(120_000)
    6. vault = await createTestVault({
         "openai-compat": {
           enabled: true,
           accessMode: "api",
           openaiCompatBaseUrl: OLLAMA_BASE_URL,
           openaiCompatApiKey: "",       // Ollama doesn't require a key
           selectedModel: OLLAMA_MODEL,
         }
       })
    7. ({ app, page } = await launchObsidian(binary, vault.vaultPath))
    8. openSidebar(page)
    9. click TAB_BTN_OPENAI_COMPAT

  afterEach: saveFailureScreenshot(page, ctx, "fail-openai-compat")

  afterAll:
    1. quitObsidian(app)
    2. vault?.cleanup()
    3. stopOllamaContainer()   ← always runs even on test failure

  it("sends a simple message and receives a response")
  it("creates a file in the vault via the file-op protocol")
})
```

### Vault Pre-seeding

The vault is pre-seeded with full config — no Obsidian UI interaction required:

```json
{
  "openai-compat": {
    "enabled": true,
    "accessMode": "api",
    "openaiCompatBaseUrl": "http://127.0.0.1:11434/v1",
    "openaiCompatApiKey": "",
    "selectedModel": "smollm2:135m"
  }
}
```

`vaultFactory.ts` already accepts these fields in `AgentSettingsOverride`.

## Implementation Plan

### P0: Must Ship

#### Phase 1: Makefile + package.json wiring (~10%)

**Files:** `package.json`, `Makefile`

**Tasks:**
- [ ] Add `"test-e2e-openai-compatible": "vitest run --config vitest.e2e-live.config.ts tests/e2e-live/openai-compat.e2e-live.test.ts"` to `package.json` scripts
  - Reuses existing vitest config; specifies the test file directly (no new config file needed)
- [ ] Add `test-e2e-openai-compatible` to Makefile `.PHONY`
- [ ] Add Makefile target:
  ```makefile
  test-e2e-openai-compatible: build
  	npm run test-e2e-openai-compatible
  ```
- [ ] **Do NOT** add `test-e2e-openai-compatible` to `test`, `test-e2e`, or `test-e2e-live` targets
- [ ] Update Makefile `help` target to describe `test-e2e-openai-compatible`
- [ ] Run `npm run build` to confirm no TypeScript errors from package.json change (scripts field is not typed but validate JSON)

#### Phase 2: Docker helpers module (~25%)

**File:** `tests/e2e-live/helpers/dockerHelpers.ts`

**Tasks:**
- [ ] `isDockerAvailable(): boolean`:
  ```typescript
  // Uses execSync("docker info") to check daemon is running
  // Returns false on any error — covers both "docker not installed" and "daemon not running"
  ```
- [ ] `startOllamaContainer(): Promise<void>`:
  ```typescript
  // 1. execSync("docker rm -f obsidian-e2e-ollama") — silent if not found
  // 2. execSync("docker run -d --name obsidian-e2e-ollama -p 11434:11434 ollama/ollama")
  // 3. Wait 3s for container process to settle
  ```
- [ ] `pullOllamaModel(): Promise<void>`:
  ```typescript
  // execSync("docker exec obsidian-e2e-ollama ollama pull smollm2:135m",
  //   { timeout: 300_000 })  // 5 min timeout for first pull
  ```
- [ ] `waitForOllamaReady(timeoutMs = 120_000): Promise<void>`:
  ```typescript
  // Poll GET http://127.0.0.1:11434/api/tags every 2s
  // Parse JSON response; look for model name in tags.models[].name
  // Throw Error with clear message after timeoutMs
  ```
- [ ] `stopOllamaContainer(): Promise<void>`:
  ```typescript
  // execSync("docker stop obsidian-e2e-ollama", { stdio: "ignore" }) — silent on failure
  // execSync("docker rm obsidian-e2e-ollama", { stdio: "ignore" }) — silent on failure
  // Both wrapped in try/catch so afterAll always resolves
  ```
- [ ] Export constants: `OLLAMA_CONTAINER_NAME`, `OLLAMA_PORT`, `OLLAMA_MODEL`, `OLLAMA_BASE_URL`
- [ ] Add comment: `// Container name is a stable constant — never accept user-controlled input`

#### Phase 3: OpenAI-compat live test file (~55%)

**File:** `tests/e2e-live/openai-compat.e2e-live.test.ts`

**Tasks:**
- [ ] Import all required helpers from existing infrastructure
- [ ] `describe.skipIf(shouldSkipSuite("api", "openai-compat"))("live-e2e: openai-compat")`:

  **`beforeAll`**:
  - [ ] `findObsidianBinary()` — throw if absent with clear error message
  - [ ] `isDockerAvailable()` — throw if absent with: `"Docker is not available. Install Docker Desktop and ensure the daemon is running before running this test."`
  - [ ] `await startOllamaContainer()`
  - [ ] `await pullOllamaModel()` — pulls model into running container
  - [ ] `await waitForOllamaReady(120_000)` — wait up to 2 min for model to be available
  - [ ] `vault = await createTestVault({ "openai-compat": { enabled: true, accessMode: "api", openaiCompatBaseUrl: OLLAMA_BASE_URL, openaiCompatApiKey: "", selectedModel: OLLAMA_MODEL } })`
  - [ ] `{ app, page } = await launchObsidian(binary, vault.vaultPath)`
  - [ ] `await openSidebar(page)`
  - [ ] `await page.locator(TAB_BTN_OPENAI_COMPAT).waitFor({ state: "visible", timeout: 10_000 })`
  - [ ] `await page.locator(TAB_BTN_OPENAI_COMPAT).click()`

  **`afterEach`**:
  - [ ] `await saveFailureScreenshot(page, ctx, "fail-openai-compat")`

  **`afterAll`**:
  - [ ] `await quitObsidian(app)` — wrapped in try/catch
  - [ ] `await vault?.cleanup()`
  - [ ] `await stopOllamaContainer()` — always runs; wrapped in try/catch

  **Test 1: "sends a simple message and receives a response"**:
  - [ ] `await sendChatMessage(page, "Say hello briefly.")`
  - [ ] `await waitForAssistantMessageComplete(page, 120_000)` — longer timeout; small CPU LLM is slow
  - [ ] Assert no chat error card: `expect(await page.locator(CHAT_ERROR).count()).toBe(0)`

  **Test 2: "creates a file in the vault via the file-op protocol"**:
  - [ ] `const filename = "live-e2e-openai-compat.md"`
  - [ ] `await sendChatMessage(page, buildFileCreatePrompt(filename))`
  - [ ] `await waitForAssistantMessageComplete(page, 120_000)`
  - [ ] `await pollForFile(vault.vaultPath, filename)`

#### Phase 4: Documentation (~10%)

**Files:** `CLAUDE.md`, optionally `tests/e2e-live/README.md`

**Tasks:**
- [ ] Update `CLAUDE.md` build section to add:
  ```
  make test-e2e-openai-compatible   # live E2E test for openai-compat agent (requires Docker)
  ```
- [ ] Update `tests/e2e-live/README.md` to add openai-compat section:
  - Prerequisites: Docker Desktop installed and daemon running
  - Run command: `make test-e2e-openai-compatible`
  - First-run: ~2–3 min (model pull); subsequent runs: ~1–2 min (Docker layer cache)
  - Resource usage: ~400–600 MB RAM, ~90 MB model download (cached after first run)
  - Note: `smollm2:135m` responses are minimal but sufficient for E2E smoke testing

### P1: Ship If Capacity Allows

- [ ] **Skip env var**: Extend `shouldSkipSuite` (or document in README) that `SKIP_OPENAI_COMPAT=1` skips this suite — already handled by the `shouldSkipSuite("api", "openai-compat")` logic in `liveHelpers.ts`
- [ ] **Docker image pre-pull optimization**: Add `make pull-ollama-model` convenience target that pre-pulls the model layer outside of test time; document as optional speed optimization
- [ ] **Port conflict detection**: Check if port 11434 is already in use before starting container; emit clear error if so

### Deferred

- Test on Linux/Windows — macOS-only scope
- Live CI integration — requires Docker-in-Docker or self-hosted runners; out of scope
- Model upgrade (larger/better model) — current sprint is smoke test only
- Multiple model tests — one model is sufficient to verify plugin functionality

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `tests/e2e-live/helpers/dockerHelpers.ts` | Create | Docker lifecycle: start/stop Ollama, pull model, wait for readiness |
| `tests/e2e-live/openai-compat.e2e-live.test.ts` | Create | Live E2E for openai-compat: chat + file-create (Docker-backed) |
| `package.json` | Modify | Add `"test-e2e-openai-compatible"` script |
| `Makefile` | Modify | Add `test-e2e-openai-compatible` target; update `.PHONY` and `help` |
| `CLAUDE.md` | Modify | Add `make test-e2e-openai-compatible` to build section |
| `tests/e2e-live/README.md` | Modify | Add openai-compat section with Docker prereqs |

## Definition of Done

- [ ] `npm run build` passes — no TypeScript errors
- [ ] `make test-e2e-openai-compatible` builds plugin then runs openai-compat live suite
- [ ] `make test` is unchanged — running it does NOT invoke openai-compat tests
- [ ] `make test-e2e-live` is unchanged — does NOT pick up `openai-compat.e2e-live.test.ts` (separate target)
- [ ] `tests/e2e-live/helpers/dockerHelpers.ts` exports: `isDockerAvailable`, `startOllamaContainer`, `pullOllamaModel`, `waitForOllamaReady`, `stopOllamaContainer`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_CONTAINER_NAME`, `OLLAMA_PORT`
- [ ] `openai-compat.e2e-live.test.ts` has 1 describe block with 2 tests: chat + file-create
- [ ] `beforeAll` throws (not skips) with clear messages when Docker absent or Obsidian absent
- [ ] `beforeAll` uses `describe.skipIf(shouldSkipSuite("api", "openai-compat"))` to skip when `SKIP_OPENAI_COMPAT=1` or `SKIP_API=1`
- [ ] `afterAll` calls `stopOllamaContainer()` in try/catch — container is always cleaned up even when tests fail
- [ ] `afterAll` calls `quitObsidian` and `vault.cleanup()`
- [ ] `pullOllamaModel()` uses `docker exec obsidian-e2e-ollama ollama pull smollm2:135m` with 5-min timeout
- [ ] `waitForOllamaReady` polls `/api/tags` and confirms model appears in response before proceeding
- [ ] Vault pre-seeded: `openaiCompatBaseUrl: "http://127.0.0.1:11434/v1"`, `selectedModel: "smollm2:135m"`, `openaiCompatApiKey: ""`, `enabled: true`, `accessMode: "api"`
- [ ] Chat test: `waitForAssistantMessageComplete(page, 120_000)` + `CHAT_ERROR` count is 0
- [ ] File creation test: `pollForFile` confirms file exists AND contains `"Created by live E2E test."`
- [ ] Screenshots saved to `tests/e2e-live/artifacts/` on failure (already in `.gitignore`)
- [ ] `CLAUDE.md` updated with `make test-e2e-openai-compatible`
- [ ] `tests/e2e-live/README.md` updated with Docker prereqs and resource usage
- [ ] No new npm packages
- [ ] No production source files modified
- [ ] On a machine with Docker + Obsidian installed, the describe block executes and both tests pass

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| smollm2:135m does not follow file-op protocol | Medium | High | Prompt embeds literal :::file-op block for model to echo (same strategy as CLI live tests) |
| Model pull times out (slow network) | Low | Medium | `pullOllamaModel` uses 300s timeout; subsequent runs use cached layers |
| Port 11434 already in use (user has Ollama running) | Low | Medium | P1: port conflict detection; beforeAll error message is clear |
| `docker exec` pull hangs silently | Low | Low | execSync has timeout; process will throw and beforeAll will fail with clear message |
| Docker not installed on test machine | Medium | Low | Suite throws with clear prerequisite error; test is opt-in (`make test-e2e-openai-compatible`) |
| smollm2:135m response too slow for `waitForAssistantMessageComplete` | Low | Medium | 120 s timeout is generous for a 135M model on CPU |
| Ollama container already running from failed previous run | Medium | Low | `startOllamaContainer` runs `docker rm -f` first to clean up stale containers |
| `make test-e2e-live` accidentally picks up new test | Low | High | Separate Makefile target runs specific file; `make test-e2e-live` unchanged |

## Security Considerations

- **No API keys**: Ollama runs locally; `openaiCompatApiKey: ""` results in "ollama" placeholder (existing `OpenAICompatProvider` behavior). No secrets in test files.
- **Container isolation**: Ollama container is bound to `127.0.0.1:11434` (loopback only) — not exposed to the network by default.
- **Container cleanup**: `stopOllamaContainer()` always runs in `afterAll`; no lingering containers after the test.
- **execSync inputs**: Container name, port, and model name are all constants — no user-controlled input passed to shell commands.
- **Docker daemon access**: Test requires Docker daemon running on developer's machine; this is an explicit prerequisite.

## Observability & Rollback

- **Post-ship verification**: `make test-e2e-openai-compatible` on a machine with Docker + Obsidian → both tests pass
- **Rollback**: All changes are test files, config, and docs. Delete `tests/e2e-live/helpers/dockerHelpers.ts`, `tests/e2e-live/openai-compat.e2e-live.test.ts`, and revert `package.json`, `Makefile`, `CLAUDE.md`. Zero impact on production plugin.

## Documentation

- [ ] Update `CLAUDE.md` with `make test-e2e-openai-compatible` command
- [ ] Update `tests/e2e-live/README.md` with openai-compat section

## Dependencies

- Sprints 001–008 complete: all E2E infrastructure stable
- Docker Desktop installed on test machine
- Obsidian binary on test machine (suite throws with clear error if absent)
- No new npm packages
- `main.js` must be built before E2E (enforced by `make test-e2e-openai-compatible: build`)

## Open Questions

1. Is `ollama/ollama:latest` + `smollm2:135m` acceptable? (~400–600 MB RAM, ~90 MB model download, no GPU)
2. Should `make test-e2e-openai-compatible` run independently of `make test-e2e-live`, or should `make test-e2e-live` optionally include it? (Draft assumes fully independent.)
3. For `waitForOllamaReady`, should we poll `/api/tags` (model list) or `/api/health`? Polling tags gives stronger guarantees — confirms the model was pulled, not just that Ollama is listening.
