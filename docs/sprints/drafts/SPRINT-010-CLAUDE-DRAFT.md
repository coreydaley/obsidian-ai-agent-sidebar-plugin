# Sprint 010: Cross-Platform Compatibility

## Overview

Every sprint since 007 has deferred Windows and partial-Linux compatibility. This sprint eliminates the accumulated platform-specific code across plugin source and test infrastructure, making the project runnable by developers on macOS, Linux, and Windows without special workarounds.

The fixes are intentionally surgical: we follow the existing `process.platform === "win32"` guard pattern already established in `obsidianBinary.ts` and `AgentDetector.ts`. No new abstraction layers or third-party packages are introduced. Each file gets the minimal change required for cross-platform correctness.

Windows E2E in CI is explicitly out of scope: downloading and installing Obsidian on a `windows-latest` runner is complex and slow, and the E2E tests already exercise the same logic paths covered by unit and integration tests. We document this as a known gap with a clear path forward.

## Use Cases

1. **Developer on Windows** can `npm install && npm test` and `npm run test-integration` without hitting Unix-specific errors.
2. **Developer on Windows** opens the plugin in Obsidian; shell env resolution correctly falls back to `process.env` without errors.
3. **Developer on any platform** can find binary installations correctly (already works, no change needed).
4. **CI (Linux)** continues to run all three test suites as today; no regression.

## Architecture

No architectural changes. All changes are conditional branches at existing call sites.

```
Fixes by layer:

src/ (plugin, runs in Obsidian's Electron/Node):
  shellEnv.ts             - Windows short-circuit before spawn attempt

tests/e2e/helpers/ (E2E harness, runs in Node outside Obsidian):
  electronHarness.ts      - Replace pgrep/pkill/osascript with cross-platform equivalents

tests/e2e-live/helpers/:
  liveHelpers.ts          - which → which/where depending on platform

tests/integration/helpers/:
  fakeAgent.ts            - Windows: invoke node directly instead of relying on shebang
```

## Implementation Plan

### P0: Must Ship

**Files:**

- `src/shellEnv.ts` — Add Windows short-circuit
- `tests/e2e/helpers/electronHarness.ts` — Replace Unix-only process commands
- `tests/e2e-live/helpers/liveHelpers.ts` — Cross-platform binary detection
- `tests/integration/helpers/fakeAgent.ts` — Windows-safe fake agent execution

**Tasks:**

- [ ] **`src/shellEnv.ts`**: Add `if (process.platform === "win32") { resolve({ ...process.env } as Record<string, string>); return; }` at the top of the `resolvedEnvPromise` callback, before the `spawn` call. Windows has no `$SHELL` and no login-shell env model; `process.env` is the correct fallback.

- [ ] **`tests/e2e/helpers/electronHarness.ts`**: Replace `pgrep`/`pkill`/`osascript` with cross-platform equivalents:
  - `isObsidianRunning()`: On Windows, use `tasklist /FI "IMAGENAME eq Obsidian.exe" /NH` and check if output contains `"Obsidian.exe"`. Keep `pgrep -x Obsidian` (macOS) and `pgrep -x obsidian` (Linux). Add `win32` branch that throws `ObsidianLaunchError` with a message that Windows E2E is not yet supported (since we have no `launchObsidianWindows` yet, this is honest).
  - `app.close()` callback: The `pkill -x obsidian` (Linux) and `osascript` (macOS) calls are inside the close function. Add `win32` branch using `taskkill /F /IM Obsidian.exe /T`.
  - `launchObsidian()`: The `win32` platform guard that throws is already present for the launch; keep it but update the message to say "Windows E2E not yet supported — see SPRINT-010 known gaps".

- [ ] **`tests/e2e-live/helpers/liveHelpers.ts`**: In `isBinaryInstalled(cmd)`, replace `execSync("which ${cmd}")` with:
  ```typescript
  const findCmd = process.platform === "win32" ? `where ${cmd}` : `which ${cmd}`;
  execSync(findCmd, { stdio: ["pipe", "pipe", "pipe"] });
  ```

- [ ] **`tests/integration/helpers/fakeAgent.ts`**: On Windows, the `.mjs` script with a `#!/usr/bin/env node` shebang is not directly executable. Fix: instead of spawning the script path directly, detect Windows and spawn `process.execPath` (the `node` binary) with the script path as the first argument. The `chmodSync` call is a no-op on Windows but harmless — keep it (adding a `if (process.platform !== "win32")` guard is optional cleanup).

- [ ] **`docs/sprints/SPRINT-010.md`** known gaps section: Document that Windows E2E in CI is deferred and the path forward (Windows runner + Obsidian installer download).

### P1: Ship If Capacity Allows

- [ ] **Unit tests for `shellEnv.ts`** platform branch: Add a test that mocks `process.platform` to `"win32"` and verifies `resolveShellEnv()` returns `process.env` without spawning.
- [ ] **CI workflow comment**: Add an inline comment in `.github/workflows/ci.yml` explaining that e2e tests are Linux-only and Windows is a known gap.

### Deferred

- **Windows E2E in CI** — Requires downloading the Obsidian Windows installer and running a `windows-latest` runner. Complex, slow (~10-15 min job), and outside this sprint's scope.
- **`launchObsidianWindows()` implementation** — The Windows launch path in `electronHarness.ts` requires spawning Obsidian via `start` or direct `.exe` invocation; deferred until Windows E2E CI is added.
- **Cross-platform abstraction layer** — If more than 8-10 call sites accumulate, a `platform.ts` utility module would be worthwhile. Currently at 4-5 sites; not yet justified.

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/shellEnv.ts` | Modify | Windows short-circuit before shell spawn |
| `tests/e2e/helpers/electronHarness.ts` | Modify | Cross-platform process detection/termination |
| `tests/e2e-live/helpers/liveHelpers.ts` | Modify | `which` → `where` on Windows |
| `tests/integration/helpers/fakeAgent.ts` | Modify | Node-based invocation on Windows |

## Definition of Done

- [ ] `npm run build` passes (TypeScript type-check + esbuild)
- [ ] `npm test` passes on macOS, Linux (CI confirms Linux)
- [ ] `npm run test-unit` passes on macOS, Linux
- [ ] `npm run test-integration` passes on macOS, Linux
- [ ] No `pgrep`, `pkill`, `osascript`, or bare `which` calls remain in test helpers (grep check)
- [ ] `src/shellEnv.ts` does not spawn a subprocess on Windows
- [ ] PR reviewed and merged

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `tasklist`/`taskkill` not available in some Windows environments | Low | Medium | Both are built into Windows since XP; document as requirement |
| `fakeAgent.ts` `node` path wrong on Windows | Low | Medium | Use `process.execPath` (current node binary) rather than `"node"` in PATH |
| Existing Linux integration tests broken by fakeAgent change | Low | High | Keep shebang execution on Linux/macOS unchanged; guard is `win32`-only |
| `where` command behavior differs from `which` on Windows | Low | Low | `where` exits non-zero when binary not found, same as `which` — try/catch already wraps it |

## Security Considerations

- No new attack surface introduced; all changes are conditional branches in existing code.
- `taskkill` and `tasklist` are called with fixed arguments, no user input interpolated.
- `where ${cmd}` and `which ${cmd}`: `cmd` comes from test code constants (binary names like `"claude"`, `"codex"`), not user input — no injection risk.

## Observability & Rollback

- **Verification post-ship**: Run `npm test && npm run test-integration` on macOS and Linux CI. Windows can be verified by a developer with Windows access running the test suite locally.
- **Rollback**: All changes are in 4 files with small diffs; git revert of the sprint commit is sufficient.

## Documentation

- [ ] Add Windows known gaps note to `docs/sprints/SPRINT-010.md` Deferred section (done inline above)
- [ ] Optional: update `CLAUDE.md` build section with a note that tests are expected to pass on macOS and Linux; Windows unit/integration tests expected to pass but E2E not yet supported in CI

## Dependencies

- None (no new external dependencies)

## Open Questions

1. For `fakeAgent.ts`: use `process.execPath` or `"node"` as the Windows Node.js command? **Recommendation**: `process.execPath` — guaranteed to point to the correct node binary regardless of PATH.
2. Should we add a Windows developer setup note to the README? Deferred — out of scope for this sprint.
