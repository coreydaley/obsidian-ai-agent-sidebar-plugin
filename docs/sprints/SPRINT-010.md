# Sprint 010: Cross-Platform Compatibility

**Status:** Planned

## Overview

Sprints 007–009 deferred Windows and partial-Linux compatibility to focus on E2E infrastructure and agent coverage. This sprint closes that accumulated debt by making both plugin runtime code (`src/`) and test infrastructure (`tests/`) reliably cross-platform across macOS, Linux, and Windows.

The fixes are surgical: we follow the `process.platform === "win32"` guard pattern already established in `obsidianBinary.ts` and `AgentDetector.ts`. No new abstractions or third-party packages are introduced. Each of the four affected files receives the minimum change needed for cross-platform correctness.

CI is extended to run unit and integration tests on all three platforms. Windows E2E is explicitly out of scope: downloading/installing Obsidian on a `windows-latest` runner is complex and slow, and the affected code paths are already exercised by unit and integration tests.

## Use Cases

1. **Windows plugin startup**: Plugin loads without attempting `$SHELL -l -c env`; API keys resolve from `process.env` safely.
2. **Windows developer workflow**: `npm test` and `npm run test-integration` pass on Windows without Unix-specific errors.
3. **Cross-platform binary detection in live E2E**: `isBinaryInstalled()` uses `where` on Windows and `which` on Unix.
4. **CI platform proof**: Unit and integration CI jobs run on all three platforms, providing automated evidence that Windows fixes work.

## Architecture

No architectural changes. All changes are conditional branches at existing call sites.

```
src/ (plugin runtime — runs inside Obsidian's Electron/Node):
  shellEnv.ts                    Win32 short-circuit before shell spawn

tests/e2e/helpers/ (E2E harness):
  electronHarness.ts             Cross-platform process detection + termination

tests/e2e-live/helpers/:
  liveHelpers.ts                 which → where on Windows

tests/integration/helpers/:
  fakeAgent.ts                   chmodSync guard (cosmetic; spawn is already cross-platform)

.github/workflows/:
  ci.yml                         Unit + integration matrix expanded to macos/ubuntu/windows

tests/unit/:
  shellEnv.test.ts               New test: win32 path skips spawn
  liveHelpers.test.ts            New test: where vs which per platform
```

### Key finding: fakeAgent.ts is already cross-platform

Integration tests already pass `process.execPath` as the `binaryPath` to `AgentRunner` and the `.mjs` script path as the first argument via `buildArgs`. This is equivalent to `spawn(node, [scriptPath])` — cross-platform by construction. The only change is a cosmetic `chmodSync` guard.

## Implementation Plan

### P0: Must Ship

**Files:**
- `src/shellEnv.ts` — Windows short-circuit
- `tests/e2e/helpers/electronHarness.ts` — Cross-platform process lifecycle
- `tests/e2e-live/helpers/liveHelpers.ts` — `where`/`which` split
- `tests/integration/helpers/fakeAgent.ts` — `chmodSync` guard
- `.github/workflows/ci.yml` — Platform matrix expansion
- `tests/unit/shellEnv.test.ts` — New unit test (create or extend)
- `tests/unit/liveHelpers.test.ts` — New unit test (create or extend)

**Tasks:**

- [ ] **`src/shellEnv.ts`**: Add Windows short-circuit at the top of the `resolvedEnvPromise` callback:
  ```typescript
  if (process.platform === "win32") {
    resolve({ ...process.env } as Record<string, string>);
    return;
  }
  ```
  Place this before the `spawn` call. Windows has no `$SHELL` and no login-shell env model; `process.env` already contains variables set in System Properties and user profile.

- [ ] **`tests/e2e/helpers/electronHarness.ts`**: Make process lifecycle cross-platform:
  - `isObsidianRunning()`: Add `win32` branch using `tasklist /FI "IMAGENAME eq Obsidian.exe" /NH /FO CSV` and checking if output contains `"Obsidian.exe"`. Using `/FO CSV` produces machine-readable output that is not affected by Windows display locale. Keep existing macOS (`pgrep -x Obsidian`) and Linux (`pgrep -x obsidian`) branches.
  - `app.close()` callback: Add `win32` branch using `taskkill /F /IM Obsidian.exe /T` alongside existing macOS (`osascript`) and Linux (`pkill -x obsidian`) branches.
  - `launchObsidian()`: Keep the `win32` guard that throws `ObsidianLaunchError`; update message to: `"Windows E2E is not yet supported. See SPRINT-010 Deferred section."`.

- [ ] **`tests/e2e-live/helpers/liveHelpers.ts`**: In `isBinaryInstalled(cmd)`:
  ```typescript
  const findCmd = process.platform === "win32" ? `where ${cmd}` : `which ${cmd}`;
  execSync(findCmd, { stdio: ["pipe", "pipe", "pipe"] });
  ```

- [ ] **`tests/integration/helpers/fakeAgent.ts`**: Guard `chmodSync` in all four write functions:
  ```typescript
  if (process.platform !== "win32") {
    chmodSync(scriptPath, 0o700);
  }
  ```
  No spawn changes needed — integration tests already use `process.execPath` as the binary.

- [ ] **`.github/workflows/ci.yml`**: Add OS matrix to `unit-tests` and `integration-tests` jobs:
  ```yaml
  strategy:
    matrix:
      os: [ubuntu-latest, macos-latest, windows-latest]
  runs-on: ${{ matrix.os }}
  ```
  Keep `e2e-tests` job on `ubuntu-latest` only. Add a comment: `# E2E tests require Obsidian AppImage; Windows E2E is a known gap (see SPRINT-010).`

- [ ] **Unit test for `shellEnv.ts` win32 path**: Mock `process.platform` to `"win32"` and verify `resolveShellEnv()` resolves to `process.env` without spawning a subprocess. Use vitest's `vi.stubGlobal` or a spy on `spawn`.

- [ ] **Unit test for `liveHelpers.ts` platform branch**: Mock `process.platform` to `"win32"` and verify `isBinaryInstalled` uses `where`; mock to `"linux"` and verify `which` is used.

- [ ] **Static audit**: Run `grep -r "pgrep\|pkill\|osascript\|execSync.*which" tests/ src/` to confirm no uncovered Unix-only calls remain after the above changes.

### P1: Ship If Capacity Allows

- [ ] Update `tests/e2e/README.md` (or create it) with a cross-platform support table: Unit (all platforms), Integration (all platforms), E2E (macOS + Linux CI; Windows gap documented).
- [ ] Add inline comment to CI workflow explaining the platform matrix decisions.

### Deferred

- **Windows E2E in CI** — Requires downloading the Obsidian Windows installer on a `windows-latest` runner (~10+ min job). Documents as known gap with a clear path forward.
- **`launchObsidianWindows()` implementation** — Needs the Windows installer download approach; deferred until Windows E2E CI is viable.
- **Cross-platform abstraction module** — Currently 4-5 call sites; abstraction not yet justified. Revisit if count grows.

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/shellEnv.ts` | Modify | Windows short-circuit before shell spawn |
| `tests/e2e/helpers/electronHarness.ts` | Modify | Cross-platform process detection/termination |
| `tests/e2e-live/helpers/liveHelpers.ts` | Modify | `which` → `where` on Windows |
| `tests/integration/helpers/fakeAgent.ts` | Modify | `chmodSync` platform guard (cosmetic) |
| `.github/workflows/ci.yml` | Modify | OS matrix for unit + integration jobs |
| `tests/unit/shellEnv.test.ts` | Create/extend | Win32 branch coverage |
| `tests/unit/liveHelpers.test.ts` | Create/extend | where/which branch coverage |

## Definition of Done

- [ ] `npm run build` passes (TypeScript type-check + esbuild)
- [ ] `npm test` passes on all CI platforms (ubuntu, macos, windows via matrix)
- [ ] `npm run test-unit` passes on all CI platforms
- [ ] `npm run test-integration` passes on all CI platforms
- [ ] `src/shellEnv.ts` does not spawn a subprocess on Windows (unit test proves this)
- [ ] `isBinaryInstalled` uses `where` on Windows (unit test proves this)
- [ ] `pgrep`, `pkill`, `osascript` remain only in their respective platform branches in `electronHarness.ts`
- [ ] No bare `which` call remains in test helpers (grep confirms)
- [ ] Existing macOS and Linux E2E behavior is unaffected — `npm run test-e2e` passes on Linux CI
- [ ] CI workflow shows three-platform matrix for unit and integration jobs

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `tasklist`/`taskkill` absent in some Windows environments | Low | Medium | Built into Windows since XP; document as requirement |
| Mocking `process.platform` in vitest proves difficult | Low | Low | Use `vi.stubGlobal("process", {...process, platform: "win32"})` or spy on the spawn call directly |
| CI Windows runner + integration tests fail on unrelated issues | Medium | Medium | Run integration tests locally on macOS/Linux first; investigate Windows-specific failures separately |
| Integration test fake-agent spawn regresses on Linux/macOS | Low | High | `chmodSync` guard is additive; no spawn behavior changes; keep existing test run green as gate |

## Security Considerations

- No new attack surface introduced; all changes are conditional branches.
- `tasklist`, `taskkill`, `where` are called with fixed literal arguments; no user input is interpolated.
- `where ${cmd}` and `which ${cmd}`: `cmd` comes from test code constants (binary names like `"claude"`, `"codex"`), not user input — no injection risk.

## Observability & Rollback

- **Verification post-ship**: CI matrix will run unit and integration tests on all three platforms automatically on every PR.
- **Rollback**: Changes are in 5-7 small files; `git revert` of the sprint commits is sufficient. No schema or config migrations.

## Documentation

- [ ] Windows E2E known gap noted in Deferred section (above — done).
- [ ] P1: `tests/e2e/README.md` cross-platform support table.

## Dependencies

- None (no new npm packages).

## Open Questions

**Windows validation gap**: Unit and integration tests provide strong coverage of the Windows code paths via platform mocking and the CI matrix. Full end-to-end validation under a real Windows Obsidian process requires Windows E2E (see Known Gaps). This is a known limitation acknowledged upfront, not an unresolved planning question.

## Known Gaps

- **Windows E2E in CI**: Not implemented. `launchObsidian()` throws `ObsidianLaunchError` on Windows with a clear message. Path forward: `windows-latest` runner + Obsidian installer download. **Trigger for future sprint**: when the team has a Windows developer available to validate the harness locally, or when the CI Windows runner cost is approved. Track as a planned sprint item.
- **`process.env` on Windows vs login-shell env**: On Windows, API keys and PATH entries must be set in System Properties (or user environment variables), not in shell profile scripts. There is no login-shell environment model. This is a user-facing limitation: Windows users must configure env vars via System Properties or a `.env` file mechanism (if supported). Document in the plugin's README in a future sprint.
