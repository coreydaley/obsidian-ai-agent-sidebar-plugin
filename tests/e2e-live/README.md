# Live E2E Tests

These tests exercise the plugin against **real CLIs and real APIs**. They are excluded from `make test` and must be run explicitly.

## Prerequisites

### Obsidian
- Obsidian desktop app installed (macOS: `/Applications/Obsidian.app`)
- Obsidian must **not** be running when you start the tests (single-instance app)

### CLI Agents (for `cli-agents.e2e-live.test.ts`)
- `claude` CLI installed and on PATH
- `codex` CLI installed and on PATH
- `copilot` CLI installed and on PATH

### API Agents (for `api-agents.e2e-live.test.ts`)
- `ANTHROPIC_API_KEY` set in your shell environment (for claude API)
- `OPENAI_API_KEY` set in your shell environment (for codex API)
- `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or `GOOGLE_GENERATIVE_AI_API_KEY` set in your shell environment (for gemini API)
- Valid active subscriptions on all accounts

### OpenAI-Compatible Agent (for `openai-compat.e2e-live.test.ts`)
- Docker Desktop installed and daemon running (`docker info` must succeed)
- No process already listening on port 11434 (stop any local Ollama instance first)
- First run downloads ~700 MB Docker image + ~90 MB model; subsequent runs use Docker layer cache
- Resource usage at runtime: ~400–600 MB RAM; no GPU required
- `smollm2:135m` responses are minimal but sufficient for smoke testing

Missing prerequisites cause the suite to **fail** with a descriptive error — these tests assume a fully configured system and do not skip.

## Selectively skipping suites

Set any of the following env vars to `1` (or any non-empty, non-`0`, non-`false` value) to skip specific suites. Skipped suites are excluded from the run entirely — they do not count as failures.

| Variable | Effect |
|---|---|
| `SKIP_CLI=1` | Skip all CLI agent suites |
| `SKIP_API=1` | Skip all API agent suites |
| `SKIP_CLAUDE=1` | Skip all claude suites (CLI + API) |
| `SKIP_CODEX=1` | Skip all codex suites (CLI + API) |
| `SKIP_COPILOT=1` | Skip copilot suite |
| `SKIP_GEMINI=1` | Skip gemini suite |
| `SKIP_CLAUDE_CLI=1` | Skip claude CLI suite only |
| `SKIP_CLAUDE_API=1` | Skip claude API suite only |
| `SKIP_CODEX_CLI=1` | Skip codex CLI suite only |
| `SKIP_CODEX_API=1` | Skip codex API suite only |
| `SKIP_COPILOT_CLI=1` | Skip copilot CLI suite only |
| `SKIP_GEMINI_API=1` | Skip gemini API suite only |
| `SKIP_OPENAI_COMPAT=1` | Skip openai-compat suite |
| `SKIP_OPENAI_COMPAT_API=1` | Skip openai-compat API suite only |

Examples:

```sh
# Only run claude tests (skip everything else)
SKIP_CODEX=1 SKIP_COPILOT=1 SKIP_GEMINI=1 make test-e2e-live

# Only run the claude CLI suite
SKIP_API=1 SKIP_CODEX=1 SKIP_COPILOT=1 SKIP_GEMINI=1 make test-e2e-live

# Skip CLI tests entirely, run only API tests
SKIP_CLI=1 make test-e2e-live

# Skip gemini and copilot (e.g. only claude + codex)
SKIP_COPILOT=1 SKIP_GEMINI=1 make test-e2e-live
```

Missing prerequisites (binary not installed, API key not set) still cause the suite to **fail** — use the skip variables above when you intentionally want to exclude a suite.

## Running

```sh
make test-e2e-live
```

Or directly:

```sh
npm run test-e2e-live
```

### OpenAI-Compatible Agent (Docker)

The openai-compat test is **excluded** from `make test-e2e-live` and must be run separately:

```sh
make test-e2e-openai-compatible
```

Or directly:

```sh
npm run test-e2e-openai-compatible
```

## Expected Runtime

3–8 minutes depending on LLM latency and which describes are not skipped.

## Notes

- Tests run **sequentially** (one Obsidian launch per describe block). Obsidian must not already be running.
- Each describe creates an isolated temp vault in `os.tmpdir()` and destroys it in `afterAll`.
- No API keys are written to disk — all API agents rely on shell env resolution at runtime.
- **Copilot CLI file-create** is the highest-risk test: copilot may not consistently follow the `:::file-op` protocol. A failure here is expected in some environments.
- On a fully-configured machine (all CLIs + all API keys), all 6 describe blocks should execute and pass (none should skip).

## Artifacts

Failure screenshots are saved to `tests/e2e-live/artifacts/` automatically in `afterEach`. This directory is in `.gitignore` because screenshots may contain chat response content.
