# Sprint 009 Draft (Codex): Live E2E for OpenAI-Compatible Agent (Docker)

## Sprint Goal
Add an opt-in live E2E suite for the OpenAI-compatible API agent that boots a tiny OpenAI-compatible LLM in Docker, validates chat success and vault file-write behavior in Obsidian, and tears the container down reliably.

## Project Goal Alignment
This sprint closes the final live-coverage gap in the supported agent matrix by proving the plugin works end-to-end with a real OpenAI-compatible backend (not mocks), including:
- API-mode model listing from a live endpoint
- Chat response rendering in the sidebar
- `:::file-op` write execution into the vault
- Safe local test isolation via lifecycle-managed Docker

## Scope

### In Scope
- New live E2E spec for OpenAI-compatible agent only:
  - `tests/e2e-live/openai-compatible.e2e-live.test.ts`
- Docker lifecycle within test hooks (`beforeAll` / `afterAll`):
  - Start container
  - Pull tiny model (`smollm2:135m`)
  - Poll readiness (`/v1/models`)
  - Stop/remove container
- New manual run entrypoints:
  - `npm run test-e2e-openai-compatible`
  - `make test-e2e-openai-compatible`
- Graceful skip for missing Obsidian binary or unusable Docker environment
- Reuse existing E2E-live helpers, vault factory support, and selectors

### Out of Scope
- Changing `make test` aggregate behavior
- CI integration for Docker live tests
- New npm dependencies
- Production plugin behavior changes

## Current-State Baseline (Validated)
- `tests/e2e-live/` exists and is stable for CLI/API live suites.
- `createTestVault()` already supports `openai-compat` with `openaiCompatBaseUrl`, `openaiCompatApiKey`, and `selectedModel`.
- OpenAI-compatible selectors already exist:
  - `TAB_BTN_OPENAI_COMPAT`
  - `SETTINGS_SECTION_OPENAI_COMPAT`
  - `OPENAI_COMPAT_BASE_URL`
  - `OPENAI_COMPAT_MODEL`
- `OpenAICompatProvider` already supports custom `baseURL` and placeholder key for keyless local backends.
- `vitest.e2e-live.config.ts` already includes `tests/e2e-live/**/*.e2e-live.test.ts`.

## Design Decisions
1. Use `ollama/ollama` + `smollm2:135m` as the default tiny real LLM backend.
- Single container, straightforward OpenAI-compatible API (`/v1/*`), no extra host model file mounts.

2. Keep Docker orchestration in test code, not Makefile.
- Matches sprint intent and keeps cleanup coupled to suite lifecycle.

3. Keep this suite opt-in and isolated from existing live matrix.
- Add a dedicated script and make target that run only this spec file.

4. Treat missing Docker/Obsidian as skip, not fail.
- This suite is environment-dependent; missing local prerequisites should not produce red failures.

5. Reuse shared helpers where possible; add only minimal helper changes.
- Avoid churn in `liveHelpers.ts` unless needed for robust skip-key normalization.

## Implementation Plan

### Phase 1: Runner Wiring

**Files**
- `package.json`
- `Makefile`

**Tasks**
- [ ] Add script:
  - `"test-e2e-openai-compatible": "vitest run --config vitest.e2e-live.config.ts tests/e2e-live/openai-compatible.e2e-live.test.ts"`
- [ ] Add make target:
  - `test-e2e-openai-compatible: build` then `npm run test-e2e-openai-compatible`
- [ ] Add new target to `.PHONY`
- [ ] Add help text line for `test-e2e-openai-compatible`
- [ ] Confirm `make test` is unchanged

### Phase 2: Skip Controls and Helper Hardening

**File**
- `tests/e2e-live/helpers/liveHelpers.ts`

**Tasks**
- [ ] Ensure `shouldSkipSuite("api", "openai-compat")` supports shell-safe env names by normalizing non-alphanumeric chars to `_`.
  - Example vars after normalization:
    - `SKIP_OPENAI_COMPAT=1`
    - `SKIP_OPENAI_COMPAT_API=1`
- [ ] Keep existing behavior for current agents unchanged (`claude`, `codex`, `gemini`, `copilot`).
- [ ] (Optional additive) export a small utility to run shell command checks for Docker daemon preflight.

### Phase 3: OpenAI-Compatible Live E2E Spec

**File**
- `tests/e2e-live/openai-compatible.e2e-live.test.ts` (new)

**Suite shape**
- `describe.skipIf(shouldSkipSuite("api", "openai-compat"))("live-e2e: openai-compatible API", ...)`

**Lifecycle Tasks**
- [ ] Preflight skip checks:
  - Obsidian binary present
  - `docker` CLI present
  - Docker daemon reachable (`docker info` or equivalent)
- [ ] Create isolated container name (stable prefix + random suffix)
  - Example: `obsidian-e2e-ollama-<timestamp>`
- [ ] Start container in detached mode with API port mapping
  - `-p 11434:11434`
- [ ] Wait for Ollama service to accept requests (poll loop with timeout)
- [ ] Pull model in container (`ollama pull smollm2:135m`)
- [ ] Poll OpenAI-compatible endpoint (`GET /v1/models`) until model list includes `smollm2:135m`
- [ ] Create vault seeded for openai-compat:
  - `enabled: true`
  - `accessMode: "api"`
  - `openaiCompatBaseUrl: "http://127.0.0.1:11434/v1"`
  - `openaiCompatApiKey: ""` (provider already tolerates blank and substitutes placeholder)
  - `selectedModel: "smollm2:135m"`
- [ ] Launch Obsidian and open sidebar tab `TAB_BTN_OPENAI_COMPAT`
- [ ] `afterAll`: always stop/remove container and cleanup vault/app

**Test Cases**
- [ ] `it("shows configured openai-compatible settings and model")`
  - Validate OpenAI-compatible section and model selector are visible
  - Assert selected model contains `smollm2:135m`
- [ ] `it("sends a simple message and receives a response")`
  - Send short prompt (e.g., `"Reply with: ok"`)
  - Wait for completed assistant message
  - Assert no visible chat error state
- [ ] `it("creates a file in the vault via the file-op protocol")`
  - Use existing `buildFileCreatePrompt("live-e2e-openai-compatible.md")`
  - Wait for response completion
  - `pollForFile` and content assertion

### Phase 4: Documentation

**Files**
- `tests/e2e-live/README.md`
- `CLAUDE.md`

**Tasks**
- [ ] Add OpenAI-compatible live prerequisites section:
  - Docker installed and daemon running
  - First run may download model (~90MB)
- [ ] Document run commands:
  - `make test-e2e-openai-compatible`
  - `npm run test-e2e-openai-compatible`
- [ ] Add skip env var examples for OpenAI-compatible suite:
  - `SKIP_OPENAI_COMPAT=1`
  - `SKIP_OPENAI_COMPAT_API=1`
- [ ] Add make target to `CLAUDE.md` build/test command list

## Acceptance Criteria
1. `make test-e2e-openai-compatible` builds plugin and runs only the new OpenAI-compatible live spec.
2. The suite starts an Ollama Docker container and stops/removes it after test completion.
3. The suite verifies chat success (assistant response completes without error).
4. The suite verifies vault file creation via `:::file-op` prompt.
5. Missing Obsidian binary or unusable Docker environment causes skip behavior, not failure.
6. Existing live suites and `make test` behavior remain unchanged.

## Verification Strategy
- `npm run build`
- `npm run test-e2e-openai-compatible`
- `make test-e2e-openai-compatible`
- `make test` (regression check: does not include new target)

Manual spot checks:
- Confirm container is running during suite and removed after completion.
- Confirm selected model in settings is `smollm2:135m`.
- Confirm generated file exists in temp vault with expected content.

## Risks and Mitigations
1. First-run model pull latency causes hook timeout.
- Mitigation: explicit pull step with generous timeout; keep existing live `hookTimeout` compatible by polling progress and surfacing clear errors.

2. Host port `11434` already in use.
- Mitigation: detect conflict and skip with actionable message, or allocate a random free host port and propagate into `openaiCompatBaseUrl`.

3. Docker daemon unavailable/intermittent on developer machine.
- Mitigation: preflight daemon check and suite skip.

4. Model readiness race after pull.
- Mitigation: post-pull `/v1/models` polling with bounded retries before launching Obsidian.

5. `shouldSkipSuite` env key mismatch for hyphenated agent IDs.
- Mitigation: normalize agent/type tokens to `A-Z0-9_` before building `SKIP_*` names.

## Definition of Done
- [ ] `tests/e2e-live/openai-compatible.e2e-live.test.ts` exists and runs under `vitest.e2e-live.config.ts`
- [ ] Docker lifecycle is implemented in `beforeAll`/`afterAll` with cleanup on failure paths
- [ ] Container uses `ollama/ollama` and model `smollm2:135m`
- [ ] Readiness check includes `/v1/models` and confirms target model appears
- [ ] Vault pre-seeding uses openai-compatible fields (`openaiCompatBaseUrl`, `openaiCompatApiKey`, `selectedModel`)
- [ ] Test covers chat success and file creation success
- [ ] Suite skips when Obsidian binary is absent
- [ ] Suite skips when Docker CLI/daemon unavailable
- [ ] `package.json` includes `test-e2e-openai-compatible`
- [ ] `Makefile` includes `.PHONY` + `test-e2e-openai-compatible` target + help text
- [ ] `make test` target unchanged
- [ ] `tests/e2e-live/README.md` updated for new suite and prerequisites
- [ ] `CLAUDE.md` command list updated
- [ ] No new npm dependencies
- [ ] No production source behavior changes

## Open Questions
1. Should host port be fixed (`11434`) for simplicity, or dynamic for better coexistence with local Ollama instances?
2. Should the suite run one extra smoke assertion on `GET /api/tags` (Ollama-native) before `/v1/models`, or keep only OpenAI-compat endpoint checks?
3. If Docker preflight passes but container launch fails (e.g., image pull blocked), should this be skip or hard fail?
