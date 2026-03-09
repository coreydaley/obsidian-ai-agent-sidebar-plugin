# Sprint 009: Live E2E — OpenAI-Compatible Agent (Docker)

**Status:** Planned

## Overview

Sprint 008 completed live E2E tests for CLI agents (claude, codex, copilot) and API agents (claude, codex, gemini), but explicitly deferred the OpenAI-compatible agent. This sprint closes that gap.

The distinguishing challenge is infrastructure: unlike prior live tests that rely on pre-installed CLIs or shell-env API keys, this test must start and stop a Docker container running a real (tiny) OpenAI-compatible LLM. The selected image is `ollama/ollama:latest` with the `smollm2:135m` model (~90 MB, ~400–600 MB RAM, no GPU required). Docker lifecycle is managed entirely inside the test's `beforeAll`/`afterAll` hooks so `make test-e2e-openai-compatible` remains a clean `build → run` invocation.

The vault is pre-seeded with `openaiCompatBaseUrl` and `selectedModel` so no Obsidian UI interaction is needed to configure the agent. Two tests validate the full stack: a simple chat message receives a non-error response, and a file-op prompt creates a file in the vault.

## Use Cases

1. **Docker lifecycle**: `beforeAll` starts `ollama/ollama`, pulls `smollm2:135m`, polls `/v1/models` until the model appears; `afterAll` stops and removes the container.
2. **Chat**: Send a short message to the openai-compat tab; `waitForAssistantMessageComplete` passes; no `CHAT_ERROR` element visible.
3. **File creation**: Send `:::file-op write` prompt; file appears in vault with correct content.
4. **Skip guards**: Suite skips when `SKIP_OPENAI_COMPAT=1` or `SKIP_API=1`; throws with clear error when Docker or Obsidian is absent.

## Architecture

```
New files:
  tests/e2e-live/helpers/dockerHelpers.ts          Docker lifecycle: start, pull, wait-ready, stop; exported constants
  tests/e2e-live/openai-compat.e2e-live.test.ts    1 describe block: chat + file-create

Modified files:
  tests/e2e-live/helpers/liveHelpers.ts            Fix shouldSkipSuite hyphen normalization for openai-compat
  vitest.e2e-live.config.ts                        Add exclude for openai-compat.e2e-live.test.ts
  package.json                                     Add "test-e2e-openai-compatible" script
  Makefile                                         Add test-e2e-openai-compatible target; update .PHONY and help
  CLAUDE.md                                        Add make test-e2e-openai-compatible to build section
  tests/e2e-live/README.md                         Add openai-compat prerequisites and Docker resource notes
```

### dockerHelpers.ts Interface

```typescript
export const OLLAMA_CONTAINER_NAME = "obsidian-e2e-ollama";
export const OLLAMA_PORT = 11434;
export const OLLAMA_MODEL = "smollm2:135m";
export const OLLAMA_BASE_URL = `http://127.0.0.1:${OLLAMA_PORT}/v1`;

// Returns true when Docker CLI is accessible and daemon is responding
export function isDockerAvailable(): boolean

// Stops/removes any existing container with the same name, then starts a new one
// Binds to 127.0.0.1:11434 (loopback only)
export async function startOllamaContainer(): Promise<void>

// Runs `docker exec obsidian-e2e-ollama ollama pull smollm2:135m` (5-min timeout)
export async function pullOllamaModel(): Promise<void>

// Polls GET http://127.0.0.1:11434/v1/models until smollm2:135m appears
// Throws after timeoutMs (default 120_000)
export async function waitForOllamaReady(timeoutMs?: number): Promise<void>

// Stops and removes container; resolves even if already stopped/absent
export async function stopOllamaContainer(): Promise<void>
```

### liveHelpers.ts Change

```typescript
// Before (broken for hyphenated IDs):
const A = agent.toUpperCase();   // "openai-compat" → "OPENAI-COMPAT"

// After (correct):
const A = agent.toUpperCase().replace(/-/g, "_");   // → "OPENAI_COMPAT"
```

Documented skip vars: `SKIP_OPENAI_COMPAT=1`, `SKIP_OPENAI_COMPAT_API=1`.

### vitest.e2e-live.config.ts Change

Add to the config's `test` object:
```typescript
exclude: ["**/openai-compat.e2e-live.test.ts"],
```

The `make test-e2e-openai-compatible` target passes the file path as an explicit CLI argument, which overrides the exclude pattern in vitest. This keeps `make test-e2e-live` unchanged and `make test-e2e-openai-compatible` isolated.

### Test Structure

```typescript
describe.skipIf(shouldSkipSuite("api", "openai-compat"))("live-e2e: openai-compat", () => {
  beforeAll:
    1. binary = findObsidianBinary() — throw if absent
    2. isDockerAvailable() — throw if absent
    3. port conflict check: if 11434 in use → throw with message "Port 11434 is in use..."
    4. await startOllamaContainer()
    5. await pullOllamaModel()
    6. await waitForOllamaReady(120_000)
    7. vault = createTestVault({
         "openai-compat": {
           enabled: true, accessMode: "api",
           openaiCompatBaseUrl: OLLAMA_BASE_URL,
           openaiCompatApiKey: "",
           selectedModel: OLLAMA_MODEL,
         }
       })
    8. { app, page } = await launchObsidian(binary, vault.vaultPath)
    9. openSidebar(page)
   10. click TAB_BTN_OPENAI_COMPAT

  afterEach: saveFailureScreenshot(page, ctx, "fail-openai-compat")

  afterAll (wrapped in try/catch each step):
    1. quitObsidian(app)
    2. vault?.cleanup()
    3. stopOllamaContainer()   ← always runs

  it("sends a simple message and receives a response")
  it("creates a file in the vault via the file-op protocol")
})
```

## Implementation Plan

### P0: Must Ship

#### Phase 1: vitest.e2e-live.config.ts exclusion (~5%)

**File:** `vitest.e2e-live.config.ts`

**Tasks:**
- [ ] Read the current config; add `exclude: ["**/openai-compat.e2e-live.test.ts"]` to the `test` object
- [ ] Verify that `npm run test-e2e-live` does not pick up the new file (run with `--dry-run` or check file pattern)
- [ ] Verify that `npx vitest run --config vitest.e2e-live.config.ts tests/e2e-live/openai-compat.e2e-live.test.ts` resolves correctly (explicit path overrides exclude)

#### Phase 2: liveHelpers.ts — hyphen normalization (~5%)

**File:** `tests/e2e-live/helpers/liveHelpers.ts`

**Tasks:**
- [ ] In `shouldSkipSuite`, replace:
  ```typescript
  const A = agent.toUpperCase();
  ```
  with:
  ```typescript
  const A = agent.toUpperCase().replace(/-/g, "_");
  ```
- [ ] Verify existing agents still work: `claude`, `codex`, `gemini`, `copilot` have no hyphens, so `.replace(/-/g, "_")` is a no-op for them
- [ ] Document `SKIP_OPENAI_COMPAT=1` and `SKIP_OPENAI_COMPAT_API=1` as supported vars (in README update)

#### Phase 3: Makefile + package.json wiring (~5%)

**Files:** `package.json`, `Makefile`

**Tasks:**
- [ ] Add `"test-e2e-openai-compatible": "vitest run --config vitest.e2e-live.config.ts tests/e2e-live/openai-compat.e2e-live.test.ts"` to `package.json` scripts
- [ ] Add `test-e2e-openai-compatible` to Makefile `.PHONY`
- [ ] Add Makefile target:
  ```makefile
  test-e2e-openai-compatible: build
  	npm run test-e2e-openai-compatible
  ```
- [ ] Update Makefile `help` target to add: `test-e2e-openai-compatible  Run live E2E tests for openai-compat agent (requires Docker)`
- [ ] Confirm `make test` target is unchanged

#### Phase 4: Docker helpers module (~25%)

**File:** `tests/e2e-live/helpers/dockerHelpers.ts`

**Tasks:**
- [ ] Export constants: `OLLAMA_CONTAINER_NAME = "obsidian-e2e-ollama"`, `OLLAMA_PORT = 11434`, `OLLAMA_MODEL = "smollm2:135m"`, `OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1"`, `OLLAMA_IMAGE = "ollama/ollama:0.6.5"` (pinned version — update intentionally when upgrading Ollama)
- [ ] `isDockerAvailable(): boolean`:
  - `execSync("docker info", { stdio: "pipe" })` — returns false on any error
  - Covers "docker not installed" + "daemon not running" + "daemon not responding"
- [ ] Port conflict check (used from test's `beforeAll`): export `isPortInUse(port: number): boolean` using `net.createServer().listen(port)` pattern
- [ ] `startOllamaContainer(): Promise<void>`:
  1. `execSync("docker rm -f obsidian-e2e-ollama", { stdio: "ignore" })` — silent if not found
  2. `execSync("docker run -d --name obsidian-e2e-ollama -p 127.0.0.1:11434:11434 ollama/ollama:0.6.5")` — uses `OLLAMA_IMAGE` constant (pinned version)
  3. Poll `GET http://127.0.0.1:11434/` every 1 s until it returns any HTTP response (not `ECONNREFUSED`), up to 30 s — replaces fixed sleep; waits for Ollama's HTTP listener to bind
- [ ] `pullOllamaModel(): Promise<void>`:
  - `execSync("docker exec obsidian-e2e-ollama ollama pull smollm2:135m", { timeout: 300_000, stdio: "inherit" })`
  - `stdio: "inherit"` so model pull progress is visible in terminal
- [ ] `waitForOllamaReady(timeoutMs = 120_000): Promise<void>`:
  - Poll `GET http://127.0.0.1:11434/v1/models` every 2 s
  - Parse JSON response; check that `data[].id` includes `smollm2:135m`
  - Use `http.get()` (built-in Node) — no fetch polyfill needed (Node 18+)
  - Throw `Error("Ollama not ready after <ms>ms. Model smollm2:135m did not appear in /v1/models.")` on timeout
- [ ] `warmUpOllamaInference(): Promise<void>` (called after `waitForOllamaReady`):
  - Send a minimal `POST /v1/chat/completions` with `{"model":"smollm2:135m","messages":[{"role":"user","content":"hi"}],"stream":false,"max_tokens":5}` via `http.request()`
  - Verify response status 200 and body has `choices[0].message.content` — proves actual generation works, not just model metadata
  - Throw with clear message if response is not 200 or body is malformed
- [ ] `stopOllamaContainer(): Promise<void>`:
  - `execSync("docker stop obsidian-e2e-ollama", { stdio: "ignore" })` in try/catch
  - `execSync("docker rm obsidian-e2e-ollama", { stdio: "ignore" })` in try/catch
  - Both wrapped — `afterAll` must always resolve
- [ ] Add comment: `// All inputs to execSync are trusted constants — never pass user-controlled values`

#### Phase 5: OpenAI-compat live test file (~45%)

**File:** `tests/e2e-live/openai-compat.e2e-live.test.ts`

**Tasks:**
- [ ] Imports:
  ```typescript
  import { findObsidianBinary } from "../e2e/helpers/obsidianBinary";
  import { createTestVault, type TestVault } from "../e2e/helpers/vaultFactory";
  import { launchObsidian, quitObsidian, type ObsidianInstance } from "../e2e/helpers/electronHarness";
  import { TAB_BTN_OPENAI_COMPAT, CHAT_ERROR } from "../e2e/helpers/selectors";
  import { shouldSkipSuite, openSidebar, sendChatMessage, waitForAssistantMessageComplete,
           buildFileCreatePrompt, pollForFile, saveFailureScreenshot } from "./helpers/liveHelpers";
  import { isDockerAvailable, isPortInUse, startOllamaContainer, pullOllamaModel,
           waitForOllamaReady, stopOllamaContainer, OLLAMA_BASE_URL, OLLAMA_MODEL,
           OLLAMA_PORT } from "./helpers/dockerHelpers";
  ```
- [ ] `describe.skipIf(shouldSkipSuite("api", "openai-compat"))("live-e2e: openai-compat")`:

  **`beforeAll`**:
  - [ ] `const binary = findObsidianBinary(); if (!binary) throw new Error("Obsidian binary not found...")`
  - [ ] `if (!isDockerAvailable()) throw new Error("Docker is not available. Install Docker Desktop and ensure the daemon is running.")`
  - [ ] `if (isPortInUse(OLLAMA_PORT)) throw new Error(\`Port ${OLLAMA_PORT} is already in use. Stop any existing Ollama instance before running this test.\`)`
  - [ ] `await startOllamaContainer()`
  - [ ] `await pullOllamaModel()`
  - [ ] `await waitForOllamaReady(120_000)`
  - [ ] `await warmUpOllamaInference()` — warm-up POST to verify inference works before launching Obsidian
  - [ ] `vault = await createTestVault({ "openai-compat": { enabled: true, accessMode: "api", openaiCompatBaseUrl: OLLAMA_BASE_URL, openaiCompatApiKey: "", selectedModel: OLLAMA_MODEL } })`
  - [ ] `({ app, page } = await launchObsidian(binary, vault.vaultPath))`
  - [ ] `await openSidebar(page)`
  - [ ] `await page.locator(TAB_BTN_OPENAI_COMPAT).waitFor({ state: "visible", timeout: 10_000 })`
  - [ ] `await page.locator(TAB_BTN_OPENAI_COMPAT).click()`

  **`afterEach`**:
  - [ ] `await saveFailureScreenshot(page, ctx, "fail-openai-compat")`

  **`afterAll`**:
  - [ ] If any test failed, capture `docker logs obsidian-e2e-ollama` to `tests/e2e-live/artifacts/ollama-<timestamp>.log` for triage
  - [ ] Try/catch each step: `quitObsidian(app)`, `vault?.cleanup()`, `stopOllamaContainer()`

  **Test 1: "sends a simple message and receives a response"**:
  - [ ] `await sendChatMessage(page, "Say hello briefly.")`
  - [ ] `await waitForAssistantMessageComplete(page, 120_000)` — 120 s for CPU inference
  - [ ] `expect(await page.locator(CHAT_ERROR).count()).toBe(0)`

  **Test 2: "creates a file in the vault via the file-op protocol"**:
  - [ ] `const filename = "live-e2e-openai-compat.md"`
  - [ ] `await sendChatMessage(page, buildFileCreatePrompt(filename))`
  - [ ] `await waitForAssistantMessageComplete(page, 120_000)`
  - [ ] `await pollForFile(vault.vaultPath, filename)`

#### Phase 6: Documentation (~15%)

**Files:** `CLAUDE.md`, `tests/e2e-live/README.md`

**Tasks:**
- [ ] Update `CLAUDE.md` build section to add:
  ```
  make test-e2e-openai-compatible   # live E2E for openai-compat agent (requires Docker)
  ```
- [ ] Update `tests/e2e-live/README.md`:
  - Add section for openai-compat prerequisites: Docker Desktop installed, daemon running
  - Document `SKIP_OPENAI_COMPAT=1` and `SKIP_OPENAI_COMPAT_API=1` skip env vars
  - Note: first run downloads ~90 MB model; subsequent runs use Docker layer cache
  - Note: smollm2:135m responses are minimal but sufficient for smoke testing
  - Resource summary: ~700 MB Docker image, ~90 MB model, ~400–600 MB RAM at runtime

### P1: Ship If Capacity Allows

- [ ] **Pre-warm convenience target**: `make pull-ollama-model` — runs `docker run ... ollama pull smollm2:135m` without running tests, so first run is fast. Low priority since model is cached after first test run.
- [ ] **Config validation smoke test**: after `waitForOllamaReady`, verify that `GET /v1/models` response includes `smollm2:135m` — already done by `waitForOllamaReady`; no additional work needed here.

### Deferred

- Settings UI validation test (checking model field is visible in Obsidian settings) — not in seed scope
- Cross-platform testing (Linux/Windows) — macOS-only scope
- CI integration — requires Docker-in-Docker or self-hosted runners
- Alternative model testing (tinyllama, phi, etc.) — one model is sufficient for smoke test

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `tests/e2e-live/helpers/dockerHelpers.ts` | Create | Docker lifecycle: start/stop Ollama, pull model, port check, readiness poll, warm-up inference |
| `tests/e2e-live/openai-compat.e2e-live.test.ts` | Create | Live E2E for openai-compat: chat + file-create (Docker-backed Ollama) |
| `tests/e2e-live/helpers/liveHelpers.ts` | Modify | Fix `shouldSkipSuite` hyphen normalization for `openai-compat` agent ID |
| `vitest.e2e-live.config.ts` | Modify | Add `exclude` for openai-compat test to prevent `make test-e2e-live` from running it |
| `package.json` | Modify | Add `"test-e2e-openai-compatible"` script |
| `Makefile` | Modify | Add `test-e2e-openai-compatible` target; update `.PHONY` and `help` |
| `CLAUDE.md` | Modify | Add `make test-e2e-openai-compatible` to build section |
| `tests/e2e-live/README.md` | Modify | Add Docker prerequisites and openai-compat section |

## Definition of Done

- [ ] `npm run build` passes — no TypeScript errors
- [ ] `make test-e2e-openai-compatible` builds plugin then runs openai-compat live suite
- [ ] `make test` is unchanged — does NOT invoke openai-compat or Docker tests
- [ ] `make test-e2e-live` does NOT run openai-compat test (verified via vitest `exclude` config)
- [ ] `vitest.e2e-live.config.ts` has `exclude: ["**/openai-compat.e2e-live.test.ts"]`
- [ ] `shouldSkipSuite` in `liveHelpers.ts` normalizes hyphens to underscores — `SKIP_OPENAI_COMPAT=1` skips the suite
- [ ] `dockerHelpers.ts` exports: `isDockerAvailable`, `isPortInUse`, `startOllamaContainer`, `pullOllamaModel`, `waitForOllamaReady`, `warmUpOllamaInference`, `stopOllamaContainer`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_CONTAINER_NAME`, `OLLAMA_PORT`, `OLLAMA_IMAGE`
- [ ] `startOllamaContainer` binds to `127.0.0.1:11434` (loopback only, `-p 127.0.0.1:11434:11434`)
- [ ] `startOllamaContainer` calls `docker rm -f obsidian-e2e-ollama` first (handles stale containers)
- [ ] `pullOllamaModel` uses 300 s timeout for `docker exec ollama pull`
- [ ] `waitForOllamaReady` polls `GET /v1/models` and confirms `smollm2:135m` appears in response
- [ ] `waitForOllamaReady` throws with clear message after `timeoutMs` (default 120 s)
- [ ] `stopOllamaContainer` always resolves (try/catch); called in `afterAll`
- [ ] `isPortInUse(11434)` check in `beforeAll` — throws with actionable message if port is occupied
- [ ] Vault pre-seeded: `openaiCompatBaseUrl: "http://127.0.0.1:11434/v1"`, `selectedModel: "smollm2:135m"`, `openaiCompatApiKey: ""`, `enabled: true`, `accessMode: "api"`
- [ ] `openai-compat.e2e-live.test.ts` has 1 describe block with exactly 2 tests
- [ ] `beforeAll` throws with clear error messages when Obsidian binary absent or Docker unavailable
- [ ] `afterAll` calls `quitObsidian`, `vault.cleanup()`, `stopOllamaContainer()` each in try/catch
- [ ] Chat test: `waitForAssistantMessageComplete(page, 120_000)` + `CHAT_ERROR` count is 0
- [ ] File creation test: `pollForFile` confirms file exists AND contains `"Created by live E2E test."`
- [ ] Failure screenshots saved to `tests/e2e-live/artifacts/` with prefix `fail-openai-compat`
- [ ] `CLAUDE.md` updated with `make test-e2e-openai-compatible`
- [ ] `tests/e2e-live/README.md` updated with Docker prereqs, skip vars, resource usage
- [ ] `warmUpOllamaInference()` passes before Obsidian launches — proves actual generation works
- [ ] `startOllamaContainer` polls for HTTP listener (not fixed sleep) before returning
- [ ] `afterAll` captures `docker logs obsidian-e2e-ollama` to artifacts dir when any test fails
- [ ] When no skip env vars are set, describe block executes (is not silently skipped) — verified manually
- [ ] No new npm packages
- [ ] No production source files modified
- [ ] On a machine with Docker + Obsidian installed, describe block executes and both tests pass

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `smollm2:135m` does not follow file-op protocol | Medium | High | Prompt embeds literal `:::file-op` block for model to echo (same as CLI live tests) |
| Model pull times out on slow network | Low | Medium | 300 s timeout on `pullOllamaModel`; Docker layer cache on subsequent runs |
| Port 11434 in use (local Ollama running) | Medium | Medium | `isPortInUse` check in `beforeAll` — throws with clear message |
| `waitForOllamaReady` times out | Low | Medium | 120 s timeout; model is small and loads fast; clear error on timeout |
| First token latency: model listed but inference stalled | Low | Medium | `warmUpOllamaInference()` verifies actual generation before launching Obsidian |
| `docker exec pull` hangs silently | Low | Low | `execSync` timeout (300 s) forces a throw |
| Docker not installed | Medium | Low | `isDockerAvailable()` check; test is opt-in; not in `make test` |
| `make test-e2e-live` picks up new test | Low | High | `vitest.e2e-live.config.ts` exclude pattern prevents this |
| `shouldSkipSuite` returns wrong env var key | Low | High | Fixed by hyphen normalization in Phase 2 |
| Stale container from previous interrupted run | Low | Low | `docker rm -f` before start handles this |
| Ollama image not pulled yet on first run | Medium | Low | `docker run` auto-pulls the image; adds ~10s on first cold run |

## Security Considerations

- **No API keys**: `openaiCompatApiKey: ""` → `OpenAICompatProvider` uses "ollama" placeholder. No secrets in any file.
- **Loopback only**: `-p 127.0.0.1:11434:11434` — Ollama API not exposed beyond the local machine.
- **execSync inputs are constants**: Container name, port, image, model name are all module-level constants. No user-controlled input reaches `execSync`.
- **Pinned Docker image**: `OLLAMA_IMAGE = "ollama/ollama:0.6.5"` — pinned version prevents uncontrolled supply-chain drift from `:latest`. Update the constant intentionally when upgrading.
- **Container cleanup**: `stopOllamaContainer()` in `afterAll` try/catch — no orphaned containers after test run.
- **Artifacts**: Failure screenshots and Docker logs go to `tests/e2e-live/artifacts/` (already in `.gitignore`).

## Observability & Rollback

- **Post-ship verification**: `make test-e2e-openai-compatible` on a machine with Docker + Obsidian → both tests pass; container starts and stops cleanly.
- **Rollback**: All changes are test files, config, and docs. Delete `dockerHelpers.ts`, `openai-compat.e2e-live.test.ts`, revert `vitest.e2e-live.config.ts`, `liveHelpers.ts`, `package.json`, `Makefile`, `CLAUDE.md`, `README.md`. Zero impact on production plugin.

## Documentation

- [ ] Update `CLAUDE.md` build section with `make test-e2e-openai-compatible`
- [ ] Update `tests/e2e-live/README.md` with Docker prerequisites, skip env vars, resource usage

## Dependencies

- Sprints 001–008 complete: all E2E infrastructure stable
- Docker Desktop installed on test machine (throws with clear error if absent)
- Obsidian binary on test machine (throws with clear error if absent)
- No new npm packages
- `main.js` must be built (`make test-e2e-openai-compatible: build` ensures this)

## Open Questions

None. Interview confirmed Docker image, isolation approach, and lifecycle placement.
