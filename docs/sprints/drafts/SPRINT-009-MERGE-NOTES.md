# Sprint 009 Merge Notes

## Claude Draft Strengths
- Clean `dockerHelpers.ts` module separation; constants exported for single source of truth
- Stable container name + `docker rm -f` cleanup pattern — simple, debuggable
- Two tests matching seed scope exactly (chat + file-create)
- Explicit `waitForOllamaReady` with model confirmation before launching Obsidian

## Claude Draft Weaknesses (from Codex critique — accepted)
- `test-e2e-live` glob collision not addressed (critical bug — new file would match `vitest.e2e-live.config.ts` include pattern)
- Used `-p 11434:11434` in Docker run command — should be `-p 127.0.0.1:11434:11434`
- Polled `/api/tags` (Ollama-native) instead of `/v1/models` (OpenAI-compat endpoint)
- Port 11434 conflict detection was P1 — should be P0

## Codex Draft Strengths
- Identified `test-e2e-live` exclusion bug correctly
- Identified `shouldSkipSuite` hyphen normalization issue
- Loopback bind flag correction

## Codex Draft Weaknesses (from Claude critique — rejected)
- Skip vs throw semantics: Codex wants skip; Sprint 008 pattern uses throw — Sprint 008 wins
- Random container name suffix: stable name + `rm -f` is cleaner
- Third "settings visibility" test: scope creep beyond seed goal
- No `dockerHelpers.ts` module: inline orchestration is harder to read and reuse

## Valid Critiques Accepted
1. Add `exclude: ["**/openai-compat.e2e-live.test.ts"]` to `vitest.e2e-live.config.ts` — prevents `make test-e2e-live` from picking up Docker test
2. Fix `shouldSkipSuite` in `liveHelpers.ts` — normalize hyphens to underscores in SKIP_* env var names
3. Use `-p 127.0.0.1:11434:11434` — loopback bind
4. Port conflict detection → P0
5. Poll `/v1/models` instead of `/api/tags` for model readiness check

## Critiques Rejected (with reasoning)
- Skip semantics: Sprint 008 precedent (`api-agents.e2e-live.test.ts`) throws on missing prereqs — diagnostic errors beat silent skips
- Random container suffix: stable name is debuggable and `rm -f` handles stale containers
- Settings validation test: not in seed scope; adds complexity without new coverage

## Interview Refinements Applied
- `ollama/ollama:latest` + `smollm2:135m` confirmed by user
- `make test-e2e-openai-compatible` is fully independent of `make test-e2e-live`
- Docker lifecycle inside beforeAll/afterAll confirmed

## Final Decisions
1. New files: `dockerHelpers.ts` (module), `openai-compat.e2e-live.test.ts` (test)
2. Modified files: `vitest.e2e-live.config.ts` (add exclude), `liveHelpers.ts` (hyphen normalization), `package.json`, `Makefile`, `CLAUDE.md`, `tests/e2e-live/README.md`
3. Docker: `-p 127.0.0.1:11434:11434`, stable container name `obsidian-e2e-ollama`, `docker rm -f` cleanup
4. Readiness: poll `/v1/models`, confirm `smollm2:135m` in model list
5. Port conflict check: P0 (skip with clear message if 11434 in use)
6. Throw (not skip) for missing Obsidian binary or Docker unavailability

## Simplest Viable Filter Applied

Removed from final plan:
- Settings visibility test (Codex Phase 3 test 1) — not in seed scope
- `make pull-ollama-model` convenience target — nice-to-have, not needed for sprint goal
- P1 port conflict already promoted to P0; remaining P1 items are genuinely optional
