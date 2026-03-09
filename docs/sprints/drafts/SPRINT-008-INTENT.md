# Sprint 008 Intent: Live E2E Tests

## Seed

Now let's create some live E2E tests. For these tests we will assume that Claude has CLI and API available, Codex has CLI and API available, Gemini has API available, and copilot has CLI available. We will NOT be testing the openai compatible agent for this sprint. For the agents that have CLI capabilities, we want to enable the Agent in the settings, and then send a short, simple chat message and ensure that we get a response and not an error; let's also send a message that would create a file in the vault and check that the file gets created — we may need to enable YOLO mode for these agents in the settings for this to work. For those that have API capabilities, we want to switch the toggle to API in the settings, ensure that the Model list entries are updated with available models (should be several for each one, not just the defaults), and then send a short, simple chat message and ensure that we get a response and not an error, we also want to send a message that would create a file in the vault and check that the file gets created. For the tests we will assume that CLI and API are configured and ready to go on the user's machine with valid subscriptions and keys available. We want to call these tests e2e-live and ensure that we create a make test-e2e-live target to run them manually; this new target should NOT be part of the make test target.

## Context

- **7 sprints completed, all mock-based.** The project has a mature three-layer test pyramid (unit, integration, E2E-mock). No live tests exist yet.
- **Infrastructure is ready.** `electronHarness.ts`, `vaultFactory.ts`, `selectors.ts`, and `obsidianBinary.ts` are all stable and reusable. The vaultFactory already supports `yoloMode` in `AgentSettingsOverride`.
- **The :::file-op protocol** is embedded in system prompts for both CLI and API runners, so asking a live agent to create a file using this protocol will be understood by real LLMs.
- **No in-progress sprints.** Sprint 008 is the next number. Clean slate.
- **Live tests are intentionally separated** from the main test suite to avoid requiring real credentials in CI.

## Recent Sprint Context

- **Sprint 005**: Added mock API server + base-URL env-var override infrastructure. Mock-based E2E chat tests for Anthropic and OpenAI.
- **Sprint 006**: JSDOM unit tests for AgentChatTab. Mode-switching integration tests. No production changes.
- **Sprint 007**: Provider pure-function exports, AgentChatTab P1 deferred tests, runner integration edge cases, Gemini E2E chat (mock). Consistently deferred: "YOLO mode E2E coverage — separate concern."

## Relevant Codebase Areas

| File | Role |
|------|------|
| `tests/e2e/helpers/electronHarness.ts` | Obsidian launch/quit, CDP connect, modal handling |
| `tests/e2e/helpers/vaultFactory.ts` | Temp vault creation; pre-seeds `data.json`; supports `yoloMode` |
| `tests/e2e/helpers/selectors.ts` | All `data-testid` selectors; has `MODEL_FIELD_*`, `CHAT_*`, `TAB_BTN_*` |
| `tests/e2e/helpers/obsidianBinary.ts` | Binary path detection |
| `tests/e2e/chat-interaction.e2e.test.ts` | Pattern: mock-based chat test structure to follow |
| `tests/e2e/settings-mode-toggle.e2e.test.ts` | Pattern: settings navigation and field verification |
| `src/AgentRunner.ts` | CLI adapters; `yoloArgs` per agent |
| `vitest.e2e.config.ts` | E2E vitest config pattern to replicate |
| `Makefile` | Build/test targets |
| `package.json` | npm scripts |

## Constraints

- Must follow project conventions in CLAUDE.md
- `test-e2e-live` Makefile target MUST NOT be added to `make test` or `make test-unit` or any existing aggregate target
- Live tests reuse existing helpers from `tests/e2e/helpers/` via relative imports (no duplication)
- No new npm dependencies
- No production source changes required (all existing selectors and vaultFactory fields are already present)
- Tests must skip gracefully when the Obsidian binary is absent (same pattern as existing E2E tests)
- Tests assume real CLI binaries and API credentials are available on the developer's machine; no mocking

## Success Criteria

1. `make test-e2e-live` runs all 6 live describe blocks (3 CLI agents × chat + file-create, 3 API agents × model-list + chat + file-create)
2. Each describe block skips gracefully if the Obsidian binary is not found
3. For CLI agents: a real chat response appears in the Obsidian UI; a file is created in the vault
4. For API agents: the model select shows multiple real models (> 2); a real chat response appears; a file is created in the vault
5. `make test` is unchanged — live tests are not included

## Verification Strategy

- **Correctness**: The tests exercise real external services. A passing test is proof the full stack works end-to-end.
- **Model list**: Count the `<option>` elements inside the model `<select>` within `MODEL_FIELD_*` container; expect count > 2.
- **Chat response**: `waitForAssistantMessage()` helper (from mock E2E) verifies a non-streaming assistant message appears.
- **File creation**: After the assistant message completes, poll `fs.existsSync(path.join(vault.vaultPath, filename))` with a short timeout.
- **Edge cases**: Agent not installed / API key missing → describe-level skip, not test failure. Response too slow → 60 s test timeout (live LLMs may be slower than mocks).

## Uncertainty Assessment

- **Correctness uncertainty: Low** — the test structure is a direct extension of proven mock-based patterns. The file-op protocol is already tested at integration level.
- **Scope uncertainty: Low** — the seed is specific: 3 CLI agents, 3 API agents, defined test scenarios. openai-compat explicitly excluded.
- **Architecture uncertainty: Low** — no new infrastructure; reuses all existing helpers.
- **Key risk: LLM compliance** — a live LLM might not output the :::file-op block exactly as requested. Mitigation: phrase the file-create prompt precisely and set a generous timeout (60 s).

## Approaches Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A: Two files (cli-agents, api-agents)** — one file groups all CLI describe blocks; another groups all API describe blocks | Fewest files, logical grouping, clean separation by infrastructure type | If one agent fails it doesn't block others (fileParallelism: false, sequential anyway) | **Selected** — minimal file count while keeping types logically grouped |
| B: Six separate files (one per agent+mode) | Maximum isolation; independent skip per file | 6 files × boilerplate; launch overhead per file is same; no real benefit | Rejected — unnecessary file proliferation |
| C: One file with all 6 describe blocks | Fewest files | Single Obsidian instance not feasible (each describe needs different vault/settings); sequential launches already handled by fileParallelism: false | Rejected — each describe block needs its own beforeAll vault setup |

## Open Questions

1. Should the file-create prompt use a fixed filename (e.g., `live-e2e-created.md`) or a UUID-based name per test run? Fixed filename is simpler; it only matters if tests are run twice without cleanup, which the vault tmpdir prevents.
2. For API agents: should the model-list check be in a separate settings-navigation test, or inline with the chat test (single Obsidian launch)? Single launch is preferred to minimize overhead.
3. How should `copilot` CLI-mode behave differently from claude/codex? Copilot uses `--allow-all-tools` and `-p` prompt flag; the yoloArgs are `["--allow-all"]`. The test structure is otherwise identical.
