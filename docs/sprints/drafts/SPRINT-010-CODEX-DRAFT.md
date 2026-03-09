# Sprint 010: Cross-Platform Compatibility (macOS, Linux, Windows)

**Status:** Planned

## Overview

Sprints 007–009 delivered robust E2E/live-E2E infrastructure and broadened agent coverage, but repeatedly deferred true cross-platform hardening. This sprint closes that debt by making both plugin runtime code (`src/`) and test infrastructure (`tests/`) reliably cross-platform.

The primary goal is **Windows parity** while preserving existing macOS and Linux behavior. The scope is intentionally surgical: replace Unix-only assumptions (`$SHELL -l`, `which`, `pgrep/pkill`, `osascript`, executable-script assumptions) with explicit `process.platform` handling and safe fallbacks.

This aligns with the project goal of a practical multi-agent Obsidian plugin for desktop users, regardless of operating system, and with the existing architecture that already contains targeted `win32` branches (`obsidianBinary.ts`, `AgentDetector.ts`).

## Use Cases

1. **Windows plugin startup in API mode**: Plugin loads without attempting `$SHELL -l -c env`; API keys resolve from `process.env` safely.
2. **Cross-platform unit/integration developer workflow**: `npm test` and `npm run test-integration` pass on macOS/Linux/Windows without shell-command failures.
3. **Live E2E prereq checks on Windows**: Binary detection helpers work with `where` rather than `which`.
4. **Integration fake-agent process execution on Windows**: Test fake agent can be invoked reliably despite shebang/chmod differences.
5. **Process lifecycle handling in E2E harness**: Obsidian process detection/termination logic avoids Unix-only dependencies and remains stable across platforms.

## Architecture

```
Modified files (expected):
  src/shellEnv.ts                               explicit win32 short-circuit for env resolution
  tests/e2e/helpers/electronHarness.ts          cross-platform process detection + shutdown flow
  tests/e2e-live/helpers/liveHelpers.ts         isBinaryInstalled uses where on Windows, which on Unix
  tests/integration/helpers/fakeAgent.ts        Windows-compatible invocation wrapper/entrypoint
  .github/workflows/ci.yml                      document platform matrix and scope by job
  tests/e2e/README.md (or tests/README.md)      clarify local Windows E2E status and CI limits

Likely touched tests:
  tests/unit/**/*.test.ts                       shellEnv branch coverage for win32/non-win32
  tests/integration/**/*.test.ts                fakeAgent path/execution expectations
  tests/e2e/**/*.test.ts                        harness behavior regressions from process logic changes
```

### Platform Strategy

- Use `process.platform` branches at each Unix-specific callsite (`win32`, `darwin`, `linux`).
- Keep behavior unchanged for existing macOS/Linux flows unless required for shared abstraction.
- Avoid new dependencies unless a native Node API cannot provide the same reliability.
- Prefer deterministic process handling with built-in Node APIs over shelling out to platform-specific tools.

## Implementation Plan

### P0: Must Ship

#### Phase 1: `src/shellEnv.ts` Windows-safe env resolution (~20%)

**File:** `src/shellEnv.ts`

**Tasks:**
- [ ] Add explicit early return for `process.platform === "win32"` that returns `process.env` (or normalized copy) without spawning a shell.
- [ ] Preserve current login-shell strategy for macOS/Linux (`$SHELL -l -c env`) and existing fallback semantics.
- [ ] Ensure fallback path is explicit and observable (debug log entry), not silent ambiguity.
- [ ] Verify no change to API-key precedence behavior.

**Tests:**
- [ ] Add/update unit tests to assert shell spawn is skipped on `win32`.
- [ ] Add/update unit tests to assert Unix path still attempts login shell when available.

#### Phase 2: `electronHarness.ts` process lifecycle hardening (~30%)

**File:** `tests/e2e/helpers/electronHarness.ts`

**Tasks:**
- [ ] Remove/replace direct use of `pgrep`, `pkill`, and `osascript` in shared control flow.
- [ ] Implement process detection and termination using cross-platform Node primitives where possible (`ChildProcess` handles, `process.kill`, timeout + escalation strategy).
- [ ] Keep platform-conditional behavior where OS-specific handling is truly required, but isolate it behind clear helper functions.
- [ ] Preserve existing Linux/macOS launch reliability and cleanup behavior.
- [ ] Ensure failure messages are actionable (include platform and attempted strategy).

**Tests:**
- [ ] Update harness tests (or add focused tests) for platform-branch behavior.
- [ ] Run existing E2E suite locally on at least one Unix platform to catch regressions.

#### Phase 3: `liveHelpers.ts` command discovery on Windows (~10%)

**File:** `tests/e2e-live/helpers/liveHelpers.ts`

**Tasks:**
- [ ] Update `isBinaryInstalled` to use:
  - `where <cmd>` on Windows
  - `which <cmd>` on macOS/Linux
- [ ] Keep trusted-input constraint for command names (no user-controlled shell interpolation).
- [ ] Normalize exit-code handling so behavior is identical across platforms.

**Tests:**
- [ ] Add/update unit tests for both branches by mocking `process.platform` and exec behavior.

#### Phase 4: Windows-compatible fake agent execution (~25%)

**File:** `tests/integration/helpers/fakeAgent.ts`

**Tasks:**
- [ ] Replace reliance on executable shebang semantics for Windows.
- [ ] Implement one selected approach:
  - Preferred: invoke `node <fake-agent-script>.mjs` directly on Windows.
  - Alternative: generate a `.cmd` wrapper that invokes `node` and forwards args.
- [ ] Keep existing Unix behavior unchanged (`chmod` + executable script path).
- [ ] Ensure argument forwarding and stdout/stderr behavior match existing integration expectations.

**Tests:**
- [ ] Update integration tests that consume fake agent helpers to cover Windows invocation path.
- [ ] Verify integration suite still passes on Unix after refactor.

#### Phase 5: CI platform scope clarity (~10%)

**File:** `.github/workflows/ci.yml`

**Tasks:**
- [ ] Ensure unit + integration jobs run on `macos-latest`, `ubuntu-latest`, and `windows-latest` (or document exact matrix if already present).
- [ ] Keep Obsidian E2E job Linux/macOS scoped per current practical constraints.
- [ ] Add explicit comments or step names documenting why Windows E2E is excluded for now.
- [ ] Ensure workflow output makes per-job platform scope obvious to reviewers.

#### Phase 6: Documentation updates (~5%)

**Files:** `tests/e2e/README.md` and/or `docs/sprints/SPRINT-010.md` follow-up notes

**Tasks:**
- [ ] Document cross-platform support policy by test layer:
  - Unit: macOS/Linux/Windows
  - Integration: macOS/Linux/Windows
  - E2E/live-E2E: current supported runners and known Windows gap
- [ ] Document local developer expectations for running tests on Windows.

### P1: Ship If Capacity Allows

- [ ] Add a small shared internal helper for platform command resolution (`where`/`which`) to reduce repeated branching.
- [ ] Add a smoke test that explicitly asserts no Unix-only commands are called on Windows code paths.
- [ ] Add CI artifact/log hints for platform-specific failures to reduce triage time.

### Deferred

- Full Windows Obsidian GUI E2E in CI (installer/download and runner complexity).
- Broader platform abstraction module across all test helpers (intentional non-goal for this sprint).
- New third-party process-discovery dependencies.

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/shellEnv.ts` | Modify | Prevent Unix-shell env probing on Windows; keep Unix behavior intact |
| `tests/e2e/helpers/electronHarness.ts` | Modify | Replace Unix-only process lifecycle logic with cross-platform handling |
| `tests/e2e-live/helpers/liveHelpers.ts` | Modify | Use `where` on Windows, `which` on Unix for binary detection |
| `tests/integration/helpers/fakeAgent.ts` | Modify | Ensure fake agent execution works on Windows without shebang reliance |
| `.github/workflows/ci.yml` | Modify | Clarify/enforce platform matrix by test layer |
| `tests/e2e/README.md` (or equivalent) | Modify | Document platform support and known CI limits |
| `tests/**` | Modify | Add/update branch coverage and regression checks for new platform paths |

## Definition of Done

- [ ] `src/shellEnv.ts` has explicit `win32` short-circuit returning environment without shell spawn.
- [ ] No Windows code path invokes `$SHELL -l -c env`.
- [ ] `tests/e2e/helpers/electronHarness.ts` no longer depends on `pgrep`, `pkill`, or `osascript` in shared cross-platform flow.
- [ ] `tests/e2e-live/helpers/liveHelpers.ts` uses `where` on Windows and `which` on Unix.
- [ ] `tests/integration/helpers/fakeAgent.ts` runs correctly on Windows (no direct executable `.mjs` assumption).
- [ ] `npm run build` passes.
- [ ] `npm test` passes on macOS, Linux, and Windows.
- [ ] `npm run test-integration` passes on macOS, Linux, and Windows.
- [ ] Existing Linux/macOS E2E behavior remains intact (no regressions in current E2E targets).
- [ ] CI workflow clearly states which jobs run on which platforms.
- [ ] Windows E2E CI gap is explicitly documented as intentional and current-state.
- [ ] No new npm dependencies added without strong justification.

## Verification Plan

1. **Static review**
- [ ] Confirm every modified Unix-specific callsite has explicit platform handling.
- [ ] Confirm no shell interpolation of user-controlled values.

2. **Automated checks**
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run test-integration`

3. **Cross-platform runs**
- [ ] Validate green runs on macOS, Linux, and Windows for unit + integration jobs.
- [ ] Validate current E2E path still passes in existing CI-supported environments.

4. **Regression checks**
- [ ] Confirm API key and CLI discovery still work on macOS/Linux.
- [ ] Confirm fake-agent tests still exercise expected process-output semantics.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Process termination refactor causes E2E flakiness on Unix | Medium | High | Keep existing timing contracts; add targeted harness tests; run E2E smoke before merge |
| Windows fake-agent invocation differs from Unix assumptions | Medium | Medium | Use direct `node script.mjs` invocation on Windows and assert output/exit parity |
| CI matrix expansion increases runtime | Medium | Medium | Keep E2E scoped; only broaden unit/integration matrix |
| Hidden Unix-only command remains in tests | Medium | Medium | Add code search check during sprint (`rg "pgrep|pkill|osascript|which" tests src`) and review exceptions |

## Out of Scope

- New agent/provider features.
- UI/UX changes in Obsidian sidebar.
- Mobile support.
- Refactoring entire test architecture into a platform abstraction library.
