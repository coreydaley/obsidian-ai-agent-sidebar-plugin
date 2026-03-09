# Sprint 010 Security Review

Reviewer: Claude Sonnet 4.6
Date: 2026-03-09

## 1. Attack Surface

This sprint introduces no new user-facing inputs, APIs, or trust boundaries. All changes are:
- Conditional branches in existing functions
- CI workflow modifications (no new external service integrations)
- Unit test additions

**Rating: No new attack surface.**

## 2. Data Handling

- `src/shellEnv.ts`: The Windows path returns `process.env` — same data as the existing fallback. API keys from `process.env` are not logged or stored by this code. No change to data handling.
- No PII, secrets, or credentials are introduced by this sprint.

**Rating: Low — no change from current behavior.**

## 3. Injection and Parsing Risks

Three call sites use string interpolation into shell commands:

### `liveHelpers.ts`: `where ${cmd}` / `which ${cmd}`

- `cmd` is a trusted constant from test code (e.g., `"claude"`, `"codex"`, `"copilot"`).
- The existing comment already notes: `// cmd must be a trusted constant — never pass user-controlled input`.
- No additional injection risk from the Windows `where` branch.

**Rating: Low — `cmd` is a compile-time constant, not user input. Comment already in place.**

### `electronHarness.ts`: `tasklist /FI "IMAGENAME eq Obsidian.exe" /NH /FO CSV` and `taskkill /F /IM Obsidian.exe /T`

- Both commands use fully literal arguments; no variable interpolation.
- `Obsidian.exe` is hardcoded, not derived from user input.

**Rating: Low — fully literal commands, no injection vector.**

### `electronHarness.ts`: existing `pgrep -x Obsidian` / `pkill -x obsidian`

- Already in codebase, no change to these paths.
- Process names are hardcoded.

**Rating: No change.**

## 4. Authentication / Authorization

- No auth flows or permission checks are touched.
- `shellEnv.ts` change only affects how environment variables are read, not how they are validated or used for auth.

**Rating: No concern.**

## 5. Dependency Risks

- **No new npm packages introduced.** All platform-specific behavior uses Node.js built-in modules (`child_process`, `os`, `fs`) and OS built-in commands (`tasklist`, `taskkill`, `where`).
- CI workflow uses existing actions (`actions/checkout@v4`, `actions/setup-node@v4`); adding a Windows runner uses the same actions, no new third-party dependencies.

**Rating: No new dependency risk.**

## 6. Threat Model

Given project context (Obsidian plugin running on user's local machine with user-configured API keys):

**Realistic adversarial scenarios for this sprint's changes:**

1. **Command injection via binary name in `isBinaryInstalled`**: Would require a malicious `process.platform` environment or a modified `cmd` argument. Neither is realistic — `cmd` is a string literal in test code, and `process.platform` is not settable by external input. **Not exploitable.**

2. **`tasklist` output parsing attack**: An attacker could potentially name a process `Obsidian.exe` to fool `isObsidianRunning()` into returning `true` on Windows, causing the test harness to throw `ObsidianLaunchError` rather than proceeding. This is a test-infrastructure-only concern with no user data or system security impact. **Severity: Negligible (test-only code, attacker would need local process creation capability).**

3. **Environment variable spoofing via `process.env` on Windows**: Windows `process.env` could theoretically be polluted by a compromised parent process, but this is the same threat that exists on macOS/Linux with `process.env`. The Windows short-circuit does not increase this risk. **Not a new concern.**

## Findings Summary

| Finding | Rating | Section | Mitigation |
|---------|--------|---------|------------|
| `where ${cmd}` string interpolation | Low | liveHelpers.ts | cmd is a compile-time constant; existing comment documents this |
| tasklist output parse could be spoofed by same-named process | Negligible | electronHarness.ts | Test-only code; attacker needs local process creation ability; no user data at risk |
| No other findings | — | — | — |

## Required Actions (Critical/High findings)

None. No Critical or High findings.

## Recommendations (Medium/Low)

1. **Low**: Add `// Obsidian.exe is hardcoded — no user input interpolation` comment alongside the `tasklist`/`taskkill` calls, consistent with the existing comment in `liveHelpers.ts`. (Cosmetic; not a DoD requirement.)

## Pre-Flight: Definition of Ready

- [x] All **blocking open questions** are resolved — Windows validation gap is documented as a known limitation, not a blocking question
- [x] All **dependencies** identified — no new external dependencies
- [x] **Sprint sizing gate passed** (Phase 6) — 4 source files + CI + 2 test files; comfortably one sprint
- [x] **Critical/High security findings** — none; no DoD additions required
- [x] **P0 tasks are clearly distinguished** from P1 and Deferred — nothing P1/Deferred blocks P0
- [x] **Rollback plan documented** — `git revert` of sprint commits; no migrations
- [x] **Documentation tasks listed** — Windows env var limitation documented in Known Gaps; P1 README update noted
