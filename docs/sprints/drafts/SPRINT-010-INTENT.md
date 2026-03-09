# Sprint 010 Intent: Cross-Platform Compatibility

## Seed

This plugin and these tests need to be able to run on macos, linux, and windows, so let's make sure that this plugin and any of its tests are not using any features or commands or anything that is not cross-platform.

## Context

- The plugin currently runs on macOS and has partial Linux support (E2E CI runs on Ubuntu via AppImage).
- Several platform-specific constructs exist across plugin source and test infrastructure: Unix-only shell commands (`pgrep`, `pkill`, `osascript`, `which`), macOS login-shell env resolution (`$SHELL -l -c env`), and Unix-specific process handling.
- Every sprint from 007–009 explicitly deferred "Cross-platform E2E (Windows)" — this sprint directly addresses that accumulated technical debt.
- The cross-platform fixes fall into two distinct layers: (1) **plugin source** (`src/`) used by real Obsidian users, and (2) **test infrastructure** (`tests/`) used by developers running the test suite.
- Windows is the highest-priority new target; Linux support already works in CI but has a few gaps.

## Recent Sprint Context

- **Sprint 007** (E2E test infrastructure): Built the electron harness, vault factory, binary finder — macOS-first, with explicit deferral of Windows/Linux E2E.
- **Sprint 008** (Live E2E for CLI+API agents): Added live E2E tests against real CLIs/APIs. Deferred openai-compat and cross-platform.
- **Sprint 009** (Live E2E for openai-compat/Docker): Closed the Docker-based openai-compat test gap. Deferred cross-platform again.

## Relevant Codebase Areas

| File | Issue |
|------|-------|
| `src/shellEnv.ts` | Uses `$SHELL -l -c env` — invalid on Windows (no `$SHELL`). Fallback to `process.env` exists but is silent. Needs explicit Windows short-circuit. |
| `tests/e2e/helpers/electronHarness.ts` | `pgrep`/`pkill` (Unix-only), `osascript` (macOS-only), no Windows launch path. `obsidianConfigPath()` already has `win32` case. |
| `tests/e2e/helpers/obsidianBinary.ts` | Already handles `win32` via `LOCALAPPDATA\Obsidian\Obsidian.exe` — no change needed. |
| `tests/e2e-live/helpers/liveHelpers.ts` | `isBinaryInstalled` uses `execSync("which ${cmd}")` — Windows needs `where`. |
| `tests/integration/helpers/fakeAgent.ts` | `chmodSync` is a no-op on Windows; `.mjs` scripts may not be directly executable on Windows. |
| `.github/workflows/ci.yml` | E2E job is Linux-only; no Windows runner (Windows Obsidian requires `.exe`, not AppImage). |

## Constraints

- Must follow project conventions in CLAUDE.md
- Must not break existing macOS and Linux behavior
- Windows Obsidian binary path relies on LOCALAPPDATA (already implemented in obsidianBinary.ts)
- Obsidian does not provide a Windows AppImage equivalent; Windows E2E in CI is impractical without a paid Windows runner or Obsidian installer download — skip Windows E2E in CI for now
- Integration and unit tests MUST pass on Windows
- Plugin source (`src/`) MUST function correctly on Windows
- `fakeAgent.ts` Windows support requires a batch script wrapper or PowerShell equivalent alongside the `.mjs` script

## Success Criteria

1. `src/shellEnv.ts` correctly short-circuits on Windows, returning `process.env` without attempting to spawn a Unix shell.
2. `tests/e2e/helpers/electronHarness.ts` uses cross-platform process detection and termination (no `pgrep`/`pkill`/`osascript`).
3. `tests/e2e-live/helpers/liveHelpers.ts` uses `where` on Windows, `which` on Unix.
4. `tests/integration/helpers/fakeAgent.ts` correctly makes fake agent executable/runnable on Windows.
5. All unit and integration tests pass on all three platforms.
6. CI workflow documents which jobs run on which platforms.
7. No existing macOS or Linux tests are broken.

## Verification Strategy

- **Spec/documentation**: Node.js `child_process` docs, `process.platform` values (`win32`, `darwin`, `linux`).
- **Reference**: Existing `win32` branch in `obsidianBinary.ts` and `AgentDetector.ts` as patterns to follow.
- **Testing approach**: Unit tests are run in the Node.js process, so platform-specific branches can be tested by mocking `process.platform`. Integration tests exercise real process spawning — CI already covers macOS (local dev) and Linux (GitHub Actions).
- **Edge cases**:
  - Windows: `$SHELL` not set, no `pgrep`/`pkill`, `osascript` absent, `.mjs` not directly executable.
  - Linux: `pgrep -x obsidian` (lowercase) vs macOS `pgrep -x Obsidian` (uppercase) — already handled.
  - All platforms: graceful fallback when detection/termination fails.

## Uncertainty Assessment

- **Correctness uncertainty**: Low — platform detection via `process.platform` is well-understood; fixes are surgical.
- **Scope uncertainty**: Medium — Windows fakeAgent may need a `.cmd` or `.ps1` wrapper; exact mechanism TBD.
- **Architecture uncertainty**: Low — no architectural changes; all fixes are conditional branches in existing files.

## Approaches Considered

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **A: Surgical `process.platform` guards** — add `win32` branches at each Unix-specific call site | Minimal change, easy to review, follows existing project patterns (obsidianBinary.ts, AgentDetector.ts) | Slightly repetitive; same guard pattern appears in multiple files | **Selected** — matches existing codebase patterns, minimal blast radius |
| **B: Cross-platform abstraction layer** — create a `src/platform.ts` (or `tests/helpers/platform.ts`) module with `isRunning()`, `killProcess()`, `findBinary()` wrappers | Cleaner long-term; single place to update | Over-engineers for 4-5 call sites; creates new module that must be maintained; larger diff | Rejected — over-engineered for current scope |
| **C: Third-party cross-platform libraries** — e.g., `cross-spawn`, `find-process`, `which` npm package | Reduces custom code | Adds dependencies; `which` npm package would replace 2 lines of code; adds supply-chain risk | Rejected — cost-benefit unfavorable for this project's footprint |

## Open Questions

1. For `fakeAgent.ts` on Windows: should the fake agent be a `.cmd` batch file that invokes `node script.mjs`, or a PowerShell `.ps1` script? Or should `fakeAgent.ts` detect Windows and invoke `node fakeAgent.mjs` directly rather than relying on shebang execution?
2. Should Windows E2E be added to CI now (via a `windows-latest` runner downloading the Obsidian installer) or deferred? Given the complexity of downloading/installing Obsidian on Windows in CI and time cost, defer is recommended — but should be documented as a known gap.
3. Is there a Windows-compatible equivalent for the `xvfb-run` wrapping in the e2e CI job? (Windows has a display server by default, so Electron can run without Xvfb — this is a non-issue on Windows runners.)
