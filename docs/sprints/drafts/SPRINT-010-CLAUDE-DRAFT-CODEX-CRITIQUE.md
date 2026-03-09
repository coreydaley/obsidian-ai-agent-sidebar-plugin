# Sprint 010 Claude Draft Critique (by Codex)

## Summary
Claude’s draft is clear and pragmatic, but it has a few material intent mismatches: Windows validation is under-scoped, `electronHarness` still leans on Unix commands despite the sprint seed, and some sections contradict each other. It needs targeted corrections before execution.

## Critical Issues

1. Windows success criteria are weakened vs intent
- Intent success criteria explicitly require unit and integration tests to pass on all three platforms and CI clarity about platform coverage.
- Claude DoD only requires macOS/Linux pass and treats Windows verification as optional local follow-up.
- Result: sprint can be marked done without proving the primary target (Windows) for non-E2E layers.
- Fix: make Windows unit/integration pass and CI platform documentation explicit P0 + DoD requirements.

2. `electronHarness` plan conflicts with intent and itself
- Tasks say to "replace `pgrep`/`pkill`/`osascript`" but then propose keeping `pgrep` branches for macOS/Linux.
- DoD later says no `pgrep`, `pkill`, `osascript`, or bare `which` remain.
- Result: internal contradiction; implementation team cannot tell which contract is authoritative.
- Fix: choose one policy and align all sections. Given sprint intent, remove these Unix-only commands from shared helper logic entirely.

## High-Priority Issues

1. Use Cases claim binary detection needs no change, but implementation changes it
- Use Case 3 says binary installation lookup "already works, no change needed."
- P0 tasks modify `liveHelpers.ts` from `which` to `where/which` split.
- Fix: update use case language to reflect actual required Windows fix.

2. CI scope is under-planned
- Intent includes CI documentation of platform/job scope.
- Draft only proposes an optional P1 inline comment in `ci.yml` and does not include workflow changes in files summary.
- Fix: make CI scope documentation/update P0, include `.github/workflows/ci.yml` in plan and files table.

3. Missing explicit test coverage plan for new platform branches
- Key branches (`shellEnv` win32 path, `liveHelpers` where/which path, fakeAgent Windows invocation) are introduced but most tests are optional or implicit.
- Fix: add required test tasks for each branch in P0.

## Medium-Priority Issues

1. `docs/sprints/SPRINT-010.md` appears in P0 before this sprint doc exists
- Draft asks for updates to `docs/sprints/SPRINT-010.md` during implementation.
- In this workflow, planning artifacts are in `docs/sprints/drafts/` first; final sprint doc is produced later.
- Fix: point immediate documentation tasks to draft/follow-up notes, or mark final sprint doc update as post-merge step.

2. `electronHarness` Windows `taskkill` plan may be unnecessary in current scope
- The same section keeps Windows E2E unsupported and throws on Windows launch.
- Adding Windows kill logic may add complexity without meaningful runtime path coverage.
- Fix: either fully support Windows harness lifecycle now, or keep Windows E2E unsupported and avoid partial kill-path work.

## Strengths

1. Scope discipline is good: no abstraction-layer overreach and no new dependencies.
2. `fakeAgent.ts` recommendation to use `process.execPath` is correct and robust.
3. Deferred note for Windows E2E CI is realistic.

## Suggested Edits

1. Promote Windows unit/integration pass criteria to P0 and DoD.
2. Make `ci.yml` platform-scope updates P0 and include it in files summary.
3. Resolve `electronHarness` policy contradiction by removing Unix-only commands from shared flow (or explicitly revising intent alignment).
4. Fix use-case wording to match actual `liveHelpers.ts` work.
5. Add required branch tests for `shellEnv`, `liveHelpers`, and `fakeAgent`.

## Verdict
Strong base draft, but not yet intent-complete. After aligning Windows validation scope and removing contradictions around Unix command usage in `electronHarness`, it will be execution-ready.
