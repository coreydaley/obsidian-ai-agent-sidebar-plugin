# Sprint 009 Intent: Live E2E — OpenAI-Compatible Agent (Docker)

## Seed

Let's setup a live e2e for the openai compatible agent, we will call it e2e-openai-compatible and the make target will be test-e2e-openai-compatible. This test should spin up a docker container that is running a VERY small openai compatible llm, expose whatever needs to be exposed to configure our openai compatible agent, create a test vault, install the plugin, open obsidian, enable the plugin and configure it based on the information about the docker container, and then test the chat interface by sending a small, simple message and checking for a response and not an error, and then checking to see if it can create a file, similar to how we do the e2e-live tests, then the docker container should be shut down.

## Context

All 8 prior sprints are complete. Sprint 008 established `tests/e2e-live/` with live E2E tests for CLI agents (claude, codex, copilot) and API agents (claude, codex, gemini). The OpenAI-compatible agent was **explicitly deferred** from Sprint 008 (Sprint 008 Deferred: "openai-compat live tests — explicitly excluded by seed").

The infrastructure is fully ready:
- `tests/e2e-live/helpers/liveHelpers.ts` — Docker-agnostic live helpers (vault creation, chat helpers, file polling)
- `tests/e2e/helpers/vaultFactory.ts` — already supports `openai-compat` with `openaiCompatBaseUrl`, `openaiCompatApiKey`, `selectedModel`
- `tests/e2e/helpers/selectors.ts` — all openai-compat selectors exist: `TAB_BTN_OPENAI_COMPAT`, `SETTINGS_SECTION_OPENAI_COMPAT`, `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_MODEL`
- `vitest.e2e-live.config.ts` — already configured; can run specific files via CLI
- `src/providers/OpenAICompatProvider.ts` — accepts `baseURL` + `apiKey` (uses "ollama" placeholder if key is empty)

New requirement unique to this sprint: **Docker lifecycle management**. Unlike prior live tests that depend on pre-installed CLIs or env vars, this test must start/stop a Docker container that runs the LLM.

## Recent Sprint Context

- **Sprint 006**: AgentChatTab unit tests + mode-switching coverage. No production changes; test infrastructure.
- **Sprint 007**: Comprehensive test gap-filling across all layers. GeminiProvider baseURL support. Provider pure function exports. E2E Gemini chat with mock server.
- **Sprint 008**: Live E2E tests for CLI (claude, codex, copilot) and API (claude, codex, gemini) agents. Established `tests/e2e-live/` directory, `liveHelpers.ts`, `vitest.e2e-live.config.ts`. OpenAI-compat explicitly deferred.

## Relevant Codebase Areas

| File | Role |
|------|------|
| `tests/e2e-live/api-agents.e2e-live.test.ts` | Direct template for new test file |
| `tests/e2e-live/helpers/liveHelpers.ts` | Shared helpers; `shouldSkipSuite("api", "openai-compat")` will work |
| `tests/e2e/helpers/vaultFactory.ts` | `openaiCompatBaseUrl`, `openaiCompatApiKey`, `selectedModel` already supported |
| `tests/e2e/helpers/selectors.ts` | `TAB_BTN_OPENAI_COMPAT`, `SETTINGS_SECTION_OPENAI_COMPAT`, `OPENAI_COMPAT_MODEL` |
| `src/providers/OpenAICompatProvider.ts` | `constructor(apiKey, baseURL)` — uses "ollama" placeholder if apiKey="" |
| `src/types.ts` | `AgentConfig.openaiCompatBaseUrl`, `AgentConfig.openaiCompatApiKey`, `AgentConfig.selectedModel` |
| `Makefile` | Add `test-e2e-openai-compatible` target; update `.PHONY` and `help` |
| `package.json` | Add `"test-e2e-openai-compatible"` script |

## Constraints

- Must follow project conventions in CLAUDE.md
- `make test-e2e-openai-compatible` must NOT be included in `make test` aggregate
- Docker lifecycle (start/stop) managed in test `beforeAll`/`afterAll`, not Makefile
- The test must skip gracefully when Docker is not available or Obsidian is not installed
- Must reuse existing infrastructure without modifying `liveHelpers.ts` (or only additive changes)
- No new npm packages

## Success Criteria

1. `make test-e2e-openai-compatible` builds the plugin and runs the openai-compat live E2E suite
2. A Docker container running an OpenAI-compatible LLM starts before tests run and stops after
3. Test sends a simple chat message and verifies a non-error response appears in the UI
4. Test sends a file-op prompt and verifies the file is created in the vault
5. Suite skips gracefully when Docker is unavailable or Obsidian binary is absent

## Verification Strategy

- **Reference implementation**: Same pattern as `api-agents.e2e-live.test.ts` (claude/codex/gemini blocks)
- **Docker readiness**: Poll `/api/health` or `GET /v1/models` before proceeding
- **Model pull verification**: Wait for model to be ready before running tests
- **Chat test**: `waitForAssistantMessageComplete` (no streaming class) — same as other live tests
- **File creation test**: `pollForFile` + content check — same as Sprint 008

## Uncertainty Assessment

- **Correctness uncertainty**: Low — OpenAI-compat provider is already tested; test pattern is proven
- **Scope uncertainty**: Low — exactly 1 new test file + Makefile + package.json
- **Architecture uncertainty**: Medium — Docker lifecycle in vitest beforeAll/afterAll is new ground for this project; model pull timing is the main risk

## Docker Image — Research & Recommendation

The seed requires "a VERY small openai compatible llm" in Docker. Research conclusions:

### Recommended: `ollama/ollama` with `smollm2:135m`

| Attribute | Value |
|-----------|-------|
| Docker image | `ollama/ollama:latest` (~700MB compressed) |
| Model | `smollm2:135m` (Q4_K_M, ~90MB download) |
| RAM at runtime | ~400–600 MB |
| CPU | Any modern CPU, 1–2 cores, no GPU required |
| API port | 11434 |
| OpenAI-compat path | `POST /v1/chat/completions` |
| First-run setup | `ollama pull smollm2:135m` (cached after first run) |
| Est. startup time | ~60–120 s first run (model pull); ~15–30 s after Docker layer cache warm |

SmolLM2-135M is the smallest capable chat model in the Ollama registry. It produces coherent (if minimal) responses on CPU.

### Alternative considered: stub OpenAI server

A tiny Python/Node container returning hardcoded valid OpenAI responses (~20MB). Would satisfy the plugin's communication test but is not a real LLM. Rejected — the seed says "llm" explicitly.

### Alternative considered: `llama.cpp:server` + GGUF file

The `ghcr.io/ggerganov/llama.cpp:server` image (~200MB) with a TinyLlama GGUF (~670MB) requires mounting the model file externally, making test setup more complex. Ollama's pull mechanism is simpler.

## Approaches Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Ollama + smollm2:135m** (Docker exec pull at startup) | Well-documented, single container, ~500MB RAM, proven API compat, model pull cached after first run | ~90MB download first time, 60–120s startup, ollama image ~700MB | **Selected** — simplest, best documented, lowest RAM, real LLM |
| llama.cpp server + mounted GGUF | Slightly lighter image, raw C++ performance | Requires external model file management, more complex test setup | Rejected — complexity not worth savings |
| Fake/stub OpenAI server in Docker | Instant startup, ~20MB total, no model download | Not a real LLM — does not satisfy seed requirement | Rejected — seed says "llm" explicitly |
| Custom Docker image with model baked in | One-step pull, no in-container pull command | Large custom image to build/push/maintain; overkill for one test | Rejected — maintenance burden not justified |

## Open Questions

1. Is the `ollama/ollama` + `smollm2:135m` image and resource profile acceptable? (See Docker Image table above — ~400–600 MB RAM, ~90MB model download, no GPU)
2. Should the Docker container name be stable (e.g. `obsidian-e2e-ollama`) with cleanup on conflict, or use a randomized name per run?
3. Should model pull happen inside the test's `beforeAll`, or should the Makefile target offer a `make pull-ollama-model` convenience command?
