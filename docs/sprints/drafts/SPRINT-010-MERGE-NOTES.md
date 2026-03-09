# Sprint 010 Merge Notes

## Claude Draft Strengths
- Correctly identified all four files that need changes
- Right call on `process.execPath` for fakeAgent Windows path
- Correct deference on Windows E2E CI (too complex for this sprint)
- Good surgical approach: no new dependencies, no abstraction layers
- Correct that fakeAgent integration tests already use `process.execPath` — no test changes needed

## Claude Draft Weaknesses (from Codex critique)
- CI matrix: only proposed a P1 comment; should expand unit/integration matrix to Windows + macOS
- Branch test coverage was P1 optional; should be P0 required
- Use case wording said liveHelpers "already works" — incorrect, it needs the where/which fix
- `electronHarness` tasks had internal contradiction (replace pgrep vs keep pgrep for Unix)

## Codex Draft Strengths
- Correctly promoted CI multi-platform matrix to P0
- Correctly flagged missing branch test coverage
- Good verification plan structure (static review + automated + cross-platform runs + regression)
- Explicit ripgrep audit command to check for remaining Unix-only calls: `rg "pgrep|pkill|osascript|which" tests src`

## Codex Draft Weaknesses (from Claude critique)
- "Use Node primitives" for electronHarness is not feasible — no PID available for detached Obsidian
- Phase numbering adds false sequencing; the four changes are independent
- README documentation as P0 — should be P1
- Debug log in shellEnv Windows path — over-engineering
- Implied integration test updates for fakeAgent — not needed

## Valid Critiques Accepted
1. CI matrix: expand unit-tests + integration-tests to run on ubuntu-latest, macos-latest, windows-latest → **P0**
2. Branch tests for shellEnv win32 path, liveHelpers where/which, fakeAgent (verify already works) → **P0**
3. Fix use-case wording: liveHelpers does need a Windows fix

## Critiques Rejected (with reasoning)
- "Node primitives" for process detection: not feasible without knowing the PID of the detached Obsidian process; platform-specific commands are the correct approach
- Debug log in shellEnv: unnecessary complexity; the Unix fallback has no log, Windows short-circuit doesn't need one either
- Integration test changes for fakeAgent: tests already spawn `process.execPath` + scriptPath; no changes needed
- README as P0: informational, not a blocker

## Interview Refinements Applied
- User confirmed: spawn node directly (process.execPath) for fakeAgent on Windows
- User confirmed: return process.env directly on Windows (no PowerShell fallback)

## Final Decisions
1. **shellEnv.ts**: `if (process.platform === "win32") { resolve({...process.env}); return; }` before spawn
2. **electronHarness.ts**: Keep `pgrep`/`pkill`/`osascript` for macOS/Linux; add `win32` branch using `tasklist`/`taskkill`; `launchObsidian` throws on win32 with clear "Windows E2E not yet supported" message
3. **liveHelpers.ts**: `const findCmd = process.platform === "win32" ? "where" : "which"` in `isBinaryInstalled`
4. **fakeAgent.ts**: Guard `chmodSync` with `!== "win32"` (cosmetic); note that integration tests already use `process.execPath` so no spawn change needed
5. **ci.yml**: Add `strategy.matrix.os` to unit-tests and integration-tests jobs; keep e2e-tests on ubuntu-latest only
6. **Tests**: Add vitest unit test asserting shellEnv skips spawn on win32; add liveHelpers unit test asserting `where` vs `which` per platform
