# Sprint 008 Codex Draft Critique (by Claude)

## Summary

Codex's draft is well-structured and surfaces two genuinely valid improvements (prereq guards, model-fallback assertion). However, it contains a critical architectural flaw — placing live test files in `tests/e2e/` — that would violate the core constraint that live tests must NOT be part of `make test`. It also adds shared helper files in `tests/e2e/helpers/` in a way that pollutes the existing mock-test infrastructure.

## What Codex Got Right

- Correctly identifies the CLI binary prereq skip gap in my draft. This is a real oversight: I guard on Obsidian binary missing and `ObsidianLaunchError`, but not on the CLI agent binary being absent (e.g., `codex` not installed).
- Correctly identifies the model-list assertion weakness: `options.length > 2` can pass if the default hardcoded list already has 3+ entries. Adding an assertion that checks for absence of the fallback warning text ("Could not fetch models — using defaults") is a better proof of a live fetch.
- Endorses single launch per API agent describe (model-list + chat + file-create in one Obsidian session) — same as my draft and the user's preference in the interview.
- Correctly catches the import path error: `tests/e2e-live/` files should use `../e2e/helpers/` not `../../e2e/helpers/`.

## Critical Issues

**1. Test file placement violates the primary constraint**

Codex places live test files at:
- `tests/e2e/chat-interaction-live-cli.e2e.test.ts`
- `tests/e2e/chat-interaction-live-api.e2e.test.ts`

The existing `vitest.e2e.config.ts` include pattern is `tests/e2e/**/*.e2e.test.ts`. Both of Codex's live test filenames match this pattern — they *will* be picked up by `make test-e2e`, which is part of `make test`. This directly violates the requirement "this new target should NOT be part of the make test target."

Codex's dedicated `vitest.e2e-live.config.ts` uses `tests/e2e/**/*live*.e2e.test.ts` to add a filter, but that doesn't prevent the existing config from also matching. The correct fix (my draft) is a separate directory (`tests/e2e-live/`) that falls completely outside the `tests/e2e/**` glob.

**2. Shared live-specific helper files in `tests/e2e/helpers/` pollute mock-test infrastructure**

Codex adds `livePrereqs.ts` and `liveAssertions.ts` to `tests/e2e/helpers/`. These files are live-test-specific (binary detection, API key detection, model warning assertions). Placing them in the shared mock-test helpers directory creates a conceptual boundary violation: someone running `make test-e2e` (mock tests) now has live-test utilities in the same directory, which creates maintenance burden and confusion. Live-test helpers should live in `tests/e2e-live/helpers/` or be inlined in the test files.

## Medium Issues

**3. Timeout is likely too low for live LLMs**

Codex uses 60 s (same as existing mock E2E). Mock tests return in < 1 s. Real LLMs — especially on cold starts for Claude Opus or complex Gemini requests — can take 30–50 s. A 60 s per-test timeout leaves almost no margin. My draft's 120 s is safer for live tests without being excessive.

**4. No CLAUDE.md update**

Codex's draft doesn't mention updating `CLAUDE.md` to document `make test-e2e-live`. My draft includes this. Small omission, but `CLAUDE.md` is the project's primary onboarding reference.

**5. Artifact directory not specified**

"Capture screenshot artifact on failure" is correct, but the path isn't specified. For live tests in a separate directory, screenshots should go to `tests/e2e-live/artifacts/` (not mixed with mock test artifacts in `tests/e2e/artifacts/`).

## What Codex Misses That My Draft Addresses

- The `tests/e2e-live/` directory is cleanly separate from `tests/e2e/` — the existing mock-test globs cannot accidentally pick up live tests.
- `tests/e2e-live/README.md` documents prerequisites clearly for first-time runners.
- Explicit `buildFileCreatePrompt()` helper with the literal :::file-op block embedded — reduces LLM compliance risk by giving the agent exact output to echo rather than generating from scratch.
- `make test-e2e-live: build` dependency in Makefile ensures the plugin is always rebuilt before live tests run.

## Critiques of My Draft I Accept (from Codex's critique)

1. **CLI binary prereq guard**: I must add explicit checks (e.g., `which claude`) in each CLI describe's `beforeAll` and skip if the binary is absent — not just on Obsidian binary absence.
2. **Model-fallback assertion**: Add absence-of-warning check alongside `options.length > 2`.
3. **Import path correction**: `../e2e/helpers/` not `../../e2e/helpers/`.
4. **API key prereq detection**: Explicitly check env vars before launching Obsidian for API describes; skip if absent.

## Critiques I Reject

- **Placing live test files in `tests/e2e/`**: Rejected. The directory isolation is not optional — it prevents accidental inclusion in `make test`. No workaround with naming filters is robust enough.
- **Adding live helpers to `tests/e2e/helpers/`**: Rejected. Boundary violation. Live-test-specific helpers should stay in the live-test directory or be inlined.

## Verdict

Codex's draft surfaces real gaps (prereq guards, model-fallback assertion) that must be incorporated. But the file placement decision is a fundamental correctness issue that must use my draft's approach (`tests/e2e-live/` subdirectory). The merged plan should take Codex's guard patterns + my directory isolation.
