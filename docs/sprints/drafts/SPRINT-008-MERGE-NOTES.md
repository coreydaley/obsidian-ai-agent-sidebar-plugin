# Sprint 008 Merge Notes

## Claude Draft Strengths
- `tests/e2e-live/` separate directory guarantees mock test globs can never accidentally pick up live tests
- Explicit `buildFileCreatePrompt()` with literal :::file-op block embedded (minimizes LLM compliance risk)
- `make test-e2e-live: build` dependency ensures plugin is rebuilt before tests
- `tests/e2e-live/README.md` for clear prerequisite documentation
- 120 s test timeout (appropriate for real LLMs vs. 60 s mocks)
- CLAUDE.md update included

## Claude Draft Weaknesses (from Codex critique)
- Missing explicit CLI binary prereq checks (`which claude` etc.) — only guards on Obsidian binary and `ObsidianLaunchError`
- Model-list assertion `options.length > 2` is insufficient proof of live fetch; needs absence-of-fallback-warning check
- Import path in architecture section was wrong (`../../e2e/helpers/` should be `../e2e/helpers/`)
- API key prereq detection not explicitly described — needed for reliable describe-level skipping

## Codex Draft Strengths
- Correctly identified CLI binary prereq gap and proposed per-describe binary detection
- Correctly identified model-fallback assertion weakness and proposed absence-of-warning check
- Clean phased implementation plan

## Codex Draft Weaknesses (from Claude critique)
- **Critical**: Live test files placed in `tests/e2e/` match existing `vitest.e2e.config.ts` glob — would be included in `make test`, violating the primary constraint
- Adds live-test-specific helpers to `tests/e2e/helpers/` — boundary violation; pollutes mock-test infrastructure
- 60 s timeout (same as mocks) is too tight for real LLMs
- Artifact directory not specified
- No CLAUDE.md update

## Valid Critiques Accepted
1. **CLI binary prereq guard**: Add `which <binary>` (or equivalent Node `execSync` check) in CLI describe `beforeAll`; skip if absent
2. **API key prereq guard**: Check env var presence in API describe `beforeAll`; skip if absent
3. **Model-fallback assertion**: Add assertion for absence of "Could not fetch models" warning text alongside `options.length > 2`
4. **Import path correction**: `../e2e/helpers/` from `tests/e2e-live/`

## Critiques Rejected (with reasoning)
- **Live files in `tests/e2e/`**: Rejected. Strict directory isolation is the only robust way to prevent accidental inclusion in existing test runs.
- **Shared live helpers in `tests/e2e/helpers/`**: Rejected. New helpers specific to live tests belong in `tests/e2e-live/helpers/` or inlined.
- **60 s timeout**: Rejected in favor of 120 s.

## Interview Refinements Applied
- Single Obsidian launch per API agent describe (model-list + chat + file-create) — confirmed by user
- Explicit :::file-op embed approach for file-create prompt — confirmed by user

## Final Decisions
1. Directory: `tests/e2e-live/` (my draft; separate from `tests/e2e/`)
2. Files: `cli-agents.e2e-live.test.ts` + `api-agents.e2e-live.test.ts`
3. Helpers: extracted to `tests/e2e-live/helpers/liveHelpers.ts` to avoid duplication within live suite; imports from `../e2e/helpers/` (shared mock-test helpers)
4. Prereq guards: both Obsidian binary AND agent-specific binary/API key checks
5. Model-list assertion: `options.length > 2` AND absence of fallback warning text
6. Timeout: 120 s tests, 90 s hooks
7. Vitest config: `tests/e2e-live/**/*.e2e-live.test.ts` pattern (completely outside existing globs)
