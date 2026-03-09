# Sprint 008 Draft (Codex): Live E2E Coverage for Real Agents

## Sprint Goal
Add an opt-in live E2E test suite that exercises real CLI/API agent paths in Obsidian for Claude, Codex, Gemini, and Copilot, proving end-to-end chat and vault file-creation behavior without changing production code.

## Project Goal Alignment
This sprint validates the plugin’s core promises under real external dependencies (not mocks):
- Sidebar chat works with supported providers and access modes
- File-op protocol works against real model outputs
- API-mode model listing is live and populated from provider APIs
- YOLO-enabled CLI flows can execute file writes end-to-end

## Scope

### In Scope
- New live E2E suite (`e2e-live`) with 6 describe blocks:
  - CLI mode: `claude`, `codex`, `copilot`
  - API mode: `claude`, `codex`, `gemini`
- Per-agent validations:
  - CLI: chat response appears; file creation request creates a file in vault
  - API: model list is populated from live fetch; chat response appears; file creation works
- Graceful describe-level skip for missing prerequisites:
  - Obsidian binary unavailable
  - Required CLI binary missing (for CLI describes)
  - Required API key missing (for API describes)
- New manual run targets:
  - `npm run test-e2e-live`
  - `make test-e2e-live`
- Keep existing aggregate targets unchanged (`make test` still excludes live tests)

### Out of Scope
- Any production plugin/source behavior changes
- Adding dependencies
- CI integration for live tests
- OpenAI-compatible live coverage

## Current-State Baseline (Validated)
- Existing E2E tests are mock-based only (`tests/e2e/chat-interaction.e2e.test.ts`, `tests/e2e/settings-mode-toggle.e2e.test.ts`).
- E2E harness and selectors are stable and reusable (`electronHarness`, `vaultFactory`, `selectors`, `obsidianBinary`).
- `vaultFactory` already supports pre-seeding `accessMode`, `enabled`, `yoloMode`, and `apiKey`.
- `vitest.e2e.config.ts` is configured for sequential file execution and 60s timeouts, which is suitable baseline behavior for live tests.
- `Makefile` and `package.json` currently expose only mock E2E (`test-e2e`).

## Design Decisions
1. Split live tests into two spec files by mode.
- `chat-interaction-live-cli.e2e.test.ts`
- `chat-interaction-live-api.e2e.test.ts`
- Rationale: keeps setup/prereq logic clear and avoids a single oversized file.

2. Keep one describe block per agent-mode pair.
- Ensures independent skip/failure visibility and clearer triage.

3. Pre-seed settings in vault instead of UI-driving settings toggles.
- Faster and more deterministic than click-driving settings for every test.
- Uses already-proven `createTestVault()` pattern.

4. Reuse and minimally extend helper layer.
- Add small E2E-live helper utilities (chat send/wait, settings open, model option count, file polling) under `tests/e2e/helpers/`.
- Avoid duplicating local helper code across the two new files.

5. Enforce opt-in execution boundary.
- Dedicated script/Make target only.
- No inclusion in `make test`, `make test-unit`, or integration targets.

## Implementation Plan

### Phase 1: Shared Live E2E Utilities

**Files**
- `tests/e2e/helpers/livePrereqs.ts` (new)
- `tests/e2e/helpers/liveAssertions.ts` (new)
- `tests/e2e/helpers/selectors.ts` (possibly small additions only if needed)

**Tasks**
- [ ] Implement per-agent prerequisite checks:
  - CLI binary detection helper (`claude`, `codex`, `copilot`)
  - API key resolution helper per provider (Anthropic/OpenAI/Gemini)
- [ ] Reuse existing selectors and add only missing selectors for model warning text if necessary.
- [ ] Add shared helpers:
  - open sidebar
  - send chat message
  - wait for completed assistant message
  - wait for expected file existence in vault path
  - count model `<option>` entries inside `MODEL_FIELD_*`

### Phase 2: CLI Live E2E Spec

**File**
- `tests/e2e/chat-interaction-live-cli.e2e.test.ts` (new)

**Describe blocks**
- `chat-interaction-live-cli: claude`
- `chat-interaction-live-cli: codex`
- `chat-interaction-live-cli: copilot`

**Tasks (each describe)**
- [ ] Skip if Obsidian missing.
- [ ] Skip if corresponding CLI binary missing.
- [ ] Create vault with agent enabled in CLI mode and `yoloMode: true`.
- [ ] Launch Obsidian via existing harness and open sidebar.
- [ ] Send simple prompt and assert assistant message appears (non-empty, non-error).
- [ ] Send precise file-create prompt (explicit `:::file-op write` request) using unique filename.
- [ ] Assert file is created in vault within timeout.
- [ ] Capture screenshot artifact on test failure.

### Phase 3: API Live E2E Spec

**File**
- `tests/e2e/chat-interaction-live-api.e2e.test.ts` (new)

**Describe blocks**
- `chat-interaction-live-api: claude`
- `chat-interaction-live-api: codex`
- `chat-interaction-live-api: gemini`

**Tasks (each describe)**
- [ ] Skip if Obsidian missing.
- [ ] Skip if provider API key missing.
- [ ] Create vault with agent enabled in API mode and `apiKey` pre-seeded from resolved env.
- [ ] Launch Obsidian with `keepSettingsOpen: true`, navigate to plugin settings.
- [ ] Assert model field visible and model option count `> 2`.
- [ ] Assert no fallback warning text (`Could not fetch models — using defaults`) in model row.
- [ ] Open sidebar and send simple prompt; assert assistant message appears.
- [ ] Send precise file-create prompt; assert target file created in vault.
- [ ] Capture screenshot artifact on failure.

### Phase 4: Test Runner Wiring

**Files**
- `vitest.e2e-live.config.ts` (new)
- `package.json`
- `Makefile`

**Tasks**
- [ ] Add dedicated config for live suite include pattern:
  - `tests/e2e/**/*live*.e2e.test.ts`
- [ ] Set live-friendly timeout defaults (retain 60s+; increase if needed after trial runs).
- [ ] Add `package.json` script:
  - `"test-e2e-live": "vitest run --config vitest.e2e-live.config.ts"`
- [ ] Add `Makefile` target:
  - `test-e2e-live: build` then `npm run test-e2e-live`
- [ ] Confirm `make test` remains exactly `test-unit test-integration test-e2e`.

### Phase 5: Documentation and Sprint Closeout

**Files**
- `docs/sprints/SPRINT-008.md` (finalized later in merge workflow)
- Optional: short test usage note in `README.md` only if maintainers want discoverability

**Tasks**
- [ ] Document live suite prerequisites and opt-in nature.
- [ ] Include expected runtime/flake considerations for real-network tests.

## Acceptance Criteria
1. `npm run test-e2e-live` executes 6 describe blocks covering requested agent/mode matrix.
2. `make test-e2e-live` is available and works manually.
3. CLI describes verify both successful chat and vault file creation.
4. API describes verify model list population (`> 2`, no fallback warning), successful chat, and vault file creation.
5. Missing Obsidian/CLI/API prerequisites cause describe-level skip, not hard suite failure.
6. `make test` behavior is unchanged and still excludes live tests.

## Verification Strategy
- `npm run build`
- `npm run test-e2e-live`
- `make test-e2e-live`
- `make test` (regression check that target composition is unchanged)

Manual spot checks after first pass:
- Confirm generated files exist under each temp vault path during run.
- Confirm API model list options are from live provider fetch (no fallback warning).

## Risks and Mitigations
1. Live model responses may be slower than mock assumptions.
- Mitigation: use 60s+ per-test timeouts and polling helpers for file creation.

2. LLM may not reliably emit `:::file-op` on first prompt.
- Mitigation: use strict, explicit prompt template requesting only a write block and retry once before failing.

3. API model fetch may intermittently fail and fall back to defaults.
- Mitigation: fail with clear assertion message when fallback warning appears; treat as environment/service issue.

4. Local machine variability (installed binaries, auth state) can make results non-portable.
- Mitigation: explicit prerequisite checks and `ctx.skip()` at describe setup.

## Open Questions
1. Should live tests run with default 60s timeout or 90s for slower providers/accounts?
2. Should file-create assertion also validate file content, or is existence-only sufficient for Sprint 008 scope?
3. Do we want a dedicated make help entry for `test-e2e-live` in this sprint or defer to follow-up docs cleanup?
