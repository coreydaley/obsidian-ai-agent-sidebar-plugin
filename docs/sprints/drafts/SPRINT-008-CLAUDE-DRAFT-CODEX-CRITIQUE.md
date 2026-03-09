# Sprint 008 Claude Draft Critique (by Codex)

## Summary
Claude’s draft is strong on structure and implementation specificity, but it misses one explicit success criterion and has two verification weaknesses that could cause false positives or environment-driven hard failures.

## What Claude Draft Gets Right
- Correctly scopes the sprint to live E2E and keeps it out of `make test`.
- Uses the right agent/mode matrix: CLI (`claude`, `codex`, `copilot`) and API (`claude`, `codex`, `gemini`), excluding openai-compat.
- Reuses existing E2E infrastructure and preserves Obsidian single-instance constraints (`fileParallelism: false`).
- Includes practical live-test patterns: screenshot-on-failure, per-describe temp vault lifecycle, explicit file-create prompts, and dedicated `test-e2e-live` wiring.

## Critical Issues

1. Missing prerequisite skip logic for CLI/API availability
- Intent and success criteria require graceful skip when an agent binary or API credentials are missing.
- Draft only guarantees skip for missing Obsidian binary and `ObsidianLaunchError`.
- Result: tests can fail instead of skip on machines missing `claude`/`codex`/`copilot` binaries or API keys.
- Fix: add per-describe prereq checks in `beforeAll` (`ctx.skip()` for missing CLI binary/API key).

2. API model-list assertion does not prove “not defaults”
- Draft checks `options.length > 2`, but fallback defaults for all three providers already satisfy this.
- Intent explicitly expects live model list behavior, “not just defaults.”
- Fix: add a second assertion proving live fetch path, e.g. absence of fallback warning text (`Could not fetch models — using defaults`) or provider-specific count threshold above default list size.

## Medium-Priority Issues

1. Relative import path example appears incorrect
- Draft architecture section shows imports like `../../e2e/helpers/...` from `tests/e2e-live/` files.
- Correct relative path should be `../e2e/helpers/...`.
- Fix: correct the path in the architecture/design section to avoid implementation confusion.

2. API credential strategy is under-specified for deterministic test setup
- Draft chooses “no apiKey override in data.json; rely on shell env,” which mirrors production but can be fragile in test environments.
- Fix: explicitly require prereq detection before launch (same shell-env resolution strategy used by runtime), and skip describe when key absent.

## Suggested Edits
1. Add a “Prerequisite Guards” subsection with explicit rules:
- CLI describes skip when required binary missing.
- API describes skip when required key missing.
2. Strengthen API model-list success condition:
- Keep `options.length > 2` plus no fallback warning.
3. Correct helper import paths in architecture examples (`../e2e/helpers/*`).
4. Update DoD to include “missing CLI/API prereqs produce skips, not failures.”

## Verdict
Implementation-ready foundation with clear file/task planning, but not fully aligned with Sprint 008 acceptance criteria until prereq skip behavior and non-fallback model-list proof are made explicit.
