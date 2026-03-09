# Sprint 009 Codex Draft — Claude Critique

## Overall Assessment

Codex's draft covers the same ground as mine, with a few meaningful additions. The structure is slightly thinner — it lacks a dedicated `dockerHelpers.ts` module and folds Docker orchestration inline in the test. The skip-vs-throw debate is real but Codex is wrong on the Sprint 008 precedent. Four items from Codex's critique of my draft are valid and will be accepted in the merge.

---

## What Codex Got Right (that my draft missed or underweighted)

### 1. `test-e2e-live` glob collision — Critical ✓ Accept

My draft incorrectly claimed `make test-e2e-live` would not pick up the new file. The existing `vitest.e2e-live.config.ts` includes `tests/e2e-live/**/*.e2e-live.test.ts`, which matches any new `*.e2e-live.test.ts` file. This is a genuine blocker.

**Fix**: Add `exclude: ["**/openai-compat.e2e-live.test.ts"]` to `vitest.e2e-live.config.ts`. The `make test-e2e-openai-compatible` target passes the file path directly on the vitest CLI, which overrides the exclude pattern (vitest treats explicit CLI paths as overrides). This is the minimal fix with no side effects.

### 2. `shouldSkipSuite` hyphen normalization — High ✓ Accept

`"openai-compat".toUpperCase()` produces `OPENAI-COMPAT`, which contains a hyphen. Shell env vars with hyphens are technically non-standard (bash will reject `export SKIP_OPENAI-COMPAT=1`). The `shouldSkipSuite` function in `liveHelpers.ts` needs to normalize agent/type tokens from hyphens to underscores before building `SKIP_*` env var names.

**Fix**: In `liveHelpers.ts`, replace `-` with `_` in `A` and `T` before constructing the env var names. The valid env vars become `SKIP_OPENAI_COMPAT=1` and `SKIP_OPENAI_COMPAT_API=1`. This is a small additive change that does not break existing agents (none have hyphens).

### 3. Loopback binding security — Medium ✓ Accept

My draft claimed loopback-only exposure but used `-p 11434:11434` (binds to all interfaces). The correct flag is `-p 127.0.0.1:11434:11434`. Aligning the security claim with the actual implementation is the right call.

### 4. Port conflict handling should be P0 — Medium ✓ Accept

If a developer has Ollama running locally (a common setup), port 11434 is already bound. The test would fail with a confusing error. Adding a port conflict check to P0 is the right call — it's low effort and prevents a frustrating environment-sensitive failure.

---

## Gaps and Weaknesses in Codex's Draft

### 1. Skip vs throw for missing prerequisites — Rejected

Codex proposes skip semantics for missing Docker/Obsidian. This contradicts the Sprint 008 established pattern: `api-agents.e2e-live.test.ts` throws `new Error("Obsidian binary not found...")` — it does NOT skip. This is intentional: a throw in `beforeAll` produces a clear failing test with a diagnostic message, while a skip silently disappears from CI output. The existing pattern should be preserved.

### 2. No dedicated Docker helpers module — Weakness

Codex folds all Docker orchestration inline in the test file. My draft extracts it to `tests/e2e-live/helpers/dockerHelpers.ts`. The separate module is better because: (a) it's testable in isolation if needed, (b) it keeps the test file focused on test assertions, (c) it's reusable if a future sprint adds another Docker-backed test. Keeping the separation.

### 3. Random container name suffix — Rejected

Codex suggests `obsidian-e2e-ollama-<timestamp>` for the container name. A stable name (`obsidian-e2e-ollama`) combined with `docker rm -f` before start is cleaner: the container is always deterministically named, easier to debug manually (`docker logs obsidian-e2e-ollama`), and no stale containers accumulate with different names on interrupted runs.

### 4. Third test (settings validation) — Rejected as unnecessary

Codex adds an `it("shows configured openai-compatible settings and model")` test that checks the settings UI. This is scope creep beyond the seed goal. The seed says: chat test + file creation test. The model is pre-seeded in `data.json` — we don't need to verify it's visible in the UI to prove the plugin works end-to-end. Deferred.

### 5. Polling `/v1/models` vs `/api/tags` — Codex is slightly better here

Codex polls `/v1/models` (the OpenAI-compat path) for readiness. My draft polls `/api/tags` (Ollama-native). Polling `/v1/models` is the right choice — it checks the OpenAI-compat API specifically, which is what the plugin uses, and confirms the model is listed under that interface. Accept Codex's choice.

### 6. No `dockerHelpers.ts` constants export — Missing

Codex doesn't define exported constants (`OLLAMA_BASE_URL`, `OLLAMA_MODEL`, etc.). Without these, the vault seeding in the test file requires hardcoded strings rather than referencing the same source of truth as the Docker setup. My draft's approach (constants in `dockerHelpers.ts`) is better.

---

## Choices I Defend from My Draft

- **`dockerHelpers.ts` module**: Separation of concerns; reusable; testable
- **Stable container name**: Simpler debugging; no stale container accumulation
- **Throw on missing prerequisites**: Matches Sprint 008 pattern; diagnostic failures are better than silent skips
- **Two tests (not three)**: Matches seed scope; settings UI test is unnecessary overhead

---

## Summary of Accepted Codex Critiques

| # | Critique | Action |
|---|---------|--------|
| 1 | `test-e2e-live` glob collision | Add `exclude` to `vitest.e2e-live.config.ts` |
| 2 | `shouldSkipSuite` hyphen normalization | Fix in `liveHelpers.ts` |
| 3 | Loopback bind flag | Use `-p 127.0.0.1:11434:11434` |
| 4 | Port conflict to P0 | Move from P1 to P0 in merged plan |
| 5 | Poll `/v1/models` not `/api/tags` | Use OpenAI-compat endpoint for readiness check |
