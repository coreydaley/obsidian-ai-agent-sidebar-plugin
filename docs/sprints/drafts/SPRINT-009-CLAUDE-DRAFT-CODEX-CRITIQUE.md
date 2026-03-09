# Sprint 009 Claude Draft Critique (by Codex)

## Summary
Claude’s draft is detailed and largely implementation-ready, but it has two blocking misalignments with the sprint intent and two important correctness gaps that should be fixed before execution.

## Critical Issues

1. Skip requirement is contradicted by DoD and implementation text
- Intent requires graceful skip when Docker is unavailable or Obsidian is missing.
- Claude draft says skip in Use Cases, but Phase 3 + DoD explicitly require `beforeAll` to throw on missing Docker/Obsidian.
- Result: environment prerequisite failures become hard failures, violating sprint success criteria.
- Fix: use true skip behavior for prereq failures (suite-level guard), not `throw`.

2. `make test-e2e-live` exclusion claim is incorrect with current glob
- Draft states `make test-e2e-live` remains unchanged and will not pick up the new test.
- Existing `vitest.e2e-live.config.ts` includes `tests/e2e-live/**/*.e2e-live.test.ts`; proposed file path matches this pattern.
- Result: new suite would run under `make test-e2e-live` unless config or filename strategy changes.
- Fix: either:
  - add `exclude` for the OpenAI-compatible file in `vitest.e2e-live.config.ts`, or
  - place this test outside that include glob, or
  - explicitly accept inclusion and update requirements accordingly.

## High-Priority Issues

1. `shouldSkipSuite("api", "openai-compat")` is assumed to work, but current helper likely cannot map shell-safe env vars
- Current helper uppercases agent names directly; `openai-compat` yields a hyphenated token.
- Shell env var names with `-` are not valid for normal export workflows.
- Fix: normalize agent/type tokens to `[A-Z0-9_]` before constructing `SKIP_*` keys, and document `SKIP_OPENAI_COMPAT` / `SKIP_OPENAI_COMPAT_API`.

2. Security note about loopback binding is stronger than implementation
- Draft claims loopback-only exposure, but the run command shown uses `-p 11434:11434` (not explicitly `127.0.0.1` bound).
- Fix: either bind explicitly (`-p 127.0.0.1:11434:11434`) or soften the security claim.

## Medium-Priority Issues

1. Port conflict handling should be P0, not P1
- Fixed `11434` is likely to collide with local Ollama users.
- Without deterministic handling, `beforeAll` can fail unpredictably in valid developer environments.
- Fix: detect conflict and either skip with clear message or allocate a free host port and propagate into `openaiCompatBaseUrl`.

2. Naming consistency is slightly off from sprint seed
- Seed uses “e2e-openai-compatible” wording; draft uses `openai-compat.e2e-live.test.ts` and describe `live-e2e: openai-compat`.
- Not functionally wrong, but inconsistent naming increases cognitive overhead.
- Fix: standardize on “openai-compatible” in target/script/test naming where practical.

## Suggested Edits
1. Replace all prereq `throw` paths for missing Docker/Obsidian with suite skip behavior.
2. Resolve `test-e2e-live` inclusion mismatch by updating vitest include/exclude strategy.
3. Normalize `shouldSkipSuite` token handling for hyphenated agent IDs.
4. Make Docker port handling deterministic in P0 and align security language with actual bind flags.

## Verdict
Strong baseline with clear phases and practical Docker lifecycle planning, but not intent-compliant until skip semantics and test-target isolation are corrected.
