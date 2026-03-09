# Sprint 007 Draft (Codex): Comprehensive Test Gap-Filling

## Sprint Goal
Close the remaining meaningful test gaps across providers, chat UI context behavior, runner edge cases, and API-mode factory selection so the plugin’s current feature set is fully covered without changing production behavior.

## Project Goal Alignment
This sprint strengthens reliability for the plugin’s core promises from `README.md`:
- Multi-agent chat in the sidebar
- CLI/API execution paths
- Safe vault file operations (`read`, `write`, `delete`, `rename`, `list`)
- Auto-context injection from the active note
- Provider/model routing correctness

## Scope

### In Scope
- Provider-focused unit tests for:
  - `buildSystemPrompt` in `AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`, `OpenAICompatProvider`
  - `OpenAIProvider.listModels()` filtering/sorting (`gpt-`, `o\d`)
  - `GeminiProvider` message normalization logic (consecutive-role merge + last-user validation)
  - `OpenAICompatProvider` constructor fallback (`apiKey || "ollama"`)
- `AgentChatTab` unit tests for currently deferred UI logic:
  - `clearHistory()`
  - context payload to `runner.run()` (`vaultPath`, active-file read success/failure, truncation)
  - Enter-key behavior (Enter sends, Shift+Enter does not)
- `AgentRunner` integration coverage for missing process/lifecycle paths:
  - `stderr` event emission
  - non-zero process exit path
  - `extraArgs` passthrough
  - YOLO args passthrough
- `AgentApiRunner` integration coverage for file-op variants not yet asserted:
  - `write`, `delete`, `rename`, `list`
- `runnerFactory` integration coverage for settings-level `apiBaseUrl` precedence over env var (`settingsBaseUrl || rawEnvBaseUrl`)
- E2E decision on Gemini chat interaction:
  - implement if feasible with existing harness
  - otherwise document technical blocker and explicitly close as deferred with rationale

### Out of Scope
- New plugin features, settings UX changes, or production behavior changes
- New npm dependencies or test frameworks
- Refactors beyond small testability exports/helpers

## Current-State Baseline (Validated)
- `tests/unit/agent-chat-tab.unit.test.ts` already covers most runner event flows from Sprint 006 (token/complete/error/stderr/fileOp lifecycle, duplicate send suppression, destroy/recreate).
- Missing `AgentChatTab` assertions are specifically `clearHistory`, context payload construction, and Enter-key semantics.
- Provider files still keep `buildSystemPrompt` private and currently untested directly.
- `tests/integration/agent-runner.integration.test.ts` currently focuses on stream parsing/dispose and does not assert `stderr`, non-zero exit, or arg passthrough.
- `tests/integration/agent-api-runner.integration.test.ts` currently validates only `read` file-op parsing variants.
- `tests/integration/runner-factory.integration.test.ts` covers env-var base URL but not explicit settings-over-env precedence.
- `tests/e2e/chat-interaction.e2e.test.ts` covers Anthropic/OpenAI/OpenAI-compatible, but not Gemini.

## Design Decisions
1. Prefer small exports over deep mocking for pure logic.
- Export provider helper functions used in deterministic transforms (`buildSystemPrompt`; Gemini message normalization helper) for direct unit tests.

2. Keep runner edge-case tests in integration layer.
- `stderr`, exit-code behavior, and CLI arg wiring are process concerns and should remain subprocess-backed tests.

3. Reuse existing fixtures/harnesses.
- Extend `tests/integration/helpers/fakeAgent.ts` and `tests/integration/helpers/streamFixtures.ts` patterns rather than introducing new infrastructure.

4. Treat Gemini E2E as implementation-optional but decision-mandatory.
- Ship either executable coverage or an explicit infeasibility record, not silent omission.

## Implementation Plan

### Phase 1: Provider Unit Coverage

**Files**
- `src/providers/AnthropicProvider.ts`
- `src/providers/OpenAIProvider.ts`
- `src/providers/GeminiProvider.ts`
- `src/providers/OpenAICompatProvider.ts`
- `src/__tests__/providers/anthropic-provider.test.ts` (new)
- `src/__tests__/providers/openai-provider.test.ts` (new)
- `src/__tests__/providers/gemini-provider.test.ts` (new)
- `src/__tests__/providers/openai-compat-provider.test.ts` (new)

**Tasks**
- [ ] Export provider `buildSystemPrompt` functions with named exports.
- [ ] In `OpenAIProvider` tests, assert allow-list behavior for model IDs (`gpt-*` and `o\d*`) and sorting.
- [ ] In `GeminiProvider`, extract/export message normalization helper used by `stream()` and test:
  - merge consecutive same-role messages
  - reject sequences where final role is not user
- [ ] In `OpenAICompatProvider` tests, verify empty API key constructor path resolves to placeholder `ollama` key behavior.

### Phase 2: AgentChatTab Deferred Unit Cases

**Files**
- `tests/unit/agent-chat-tab.unit.test.ts`

**Tasks**
- [ ] Add `clearHistory()` test: history reset + empty state re-render.
- [ ] Add context payload tests by asserting `runner.runCalls[0].context` JSON:
  - includes `vaultPath`
  - includes active file content when `vault.read()` succeeds
  - truncates to `MAX_CONTEXT_BYTES` (8 KiB)
  - sets `activeFileContent: null` when read fails
- [ ] Add keyboard behavior tests:
  - Enter without Shift triggers send and prevents newline
  - Shift+Enter does not send

### Phase 3: AgentRunner Integration Edge Cases

**Files**
- `tests/integration/agent-runner.integration.test.ts`
- `tests/integration/helpers/fakeAgent.ts` (if needed)

**Tasks**
- [ ] Add test for forwarded `stderr` lines emitted by fake process.
- [ ] Add test for non-zero process exit producing `error` event.
- [ ] Add arg-capture fake script and assert `extraArgs` passthrough.
- [ ] Add YOLO passthrough assertion by instantiating runner with expected leading yolo flags.

### Phase 4: AgentApiRunner File-Op Variant Coverage

**Files**
- `tests/integration/agent-api-runner.integration.test.ts`
- `tests/integration/helpers/streamFixtures.ts` (reuse existing helpers)

**Tasks**
- [ ] Add tests validating parse+execute for `write` blocks.
- [ ] Add tests validating parse+execute for `delete` blocks.
- [ ] Add tests validating parse+execute for `rename` blocks.
- [ ] Add tests validating parse+execute for `list` blocks.
- [ ] Assert emitted `fileOpStart` payloads and corresponding `fileOpResult` cardinality.

### Phase 5: runnerFactory Settings Base URL Precedence

**Files**
- `tests/integration/runner-factory.integration.test.ts`

**Tasks**
- [ ] Add test where both env base URL and settings `apiBaseUrl` are present.
- [ ] Assert settings URL path is selected (not env) by validating behavior through runner construction path (and, if needed, provider constructor spy/mocking constrained to this test file).
- [ ] Add negative case where settings URL is invalid and env URL is valid to document current `settingsBaseUrl || rawEnvBaseUrl` behavior.

### Phase 6: Gemini E2E Coverage Decision

**Files**
- `tests/e2e/chat-interaction.e2e.test.ts` (if feasible)
- `tests/e2e/helpers/mockApiServer.ts` (if feasible)
- `docs/sprints/drafts/SPRINT-007-MERGE-NOTES.md` (fallback note if infeasible)

**Tasks**
- [ ] Attempt Gemini API-mode chat E2E using current Obsidian harness and mock server approach.
- [ ] If Gemini SDK endpoint format can be mocked with current server patterns, add parity test block.
- [ ] If not feasible without intrusive harness/network interception changes, document exact blocker and defer explicitly.

## Acceptance Criteria
1. Provider prompt builders are directly unit-tested for all four API providers.
2. OpenAI model filter logic has direct coverage.
3. Gemini message normalization and last-user guard logic have direct coverage.
4. `AgentChatTab` has tests for `clearHistory`, context payload, and Enter-key behavior.
5. `AgentRunner` integration suite covers `stderr`, non-zero exit, and arg passthrough (`extraArgs` + YOLO).
6. `AgentApiRunner` integration suite covers all file-op variants (`read`, `write`, `delete`, `rename`, `list`).
7. `runnerFactory` tests include settings-level `apiBaseUrl` precedence behavior.
8. Gemini E2E is either implemented or formally documented as infeasible with concrete technical reason.

## Verification Strategy
- `npm test`
- `npm run test-unit`
- `npm run test-integration` (or `make test-integration`)
- `npm run test-e2e` (skip-safe when Obsidian binary is unavailable)
- `npm run build`

## Risks and Mitigations
1. Exporting helpers could accidentally alter module API shape expectations.
- Mitigation: named exports only; no runtime behavior changes.

2. Provider unit tests may require targeted SDK mocking patterns that are brittle.
- Mitigation: test pure helpers directly and keep SDK interaction assertions minimal.

3. Gemini E2E may be blocked by SDK transport assumptions not covered by current mock server.
- Mitigation: timebox implementation attempt and produce explicit defer note with evidence.

## Open Questions
1. For `runnerFactory` base URL precedence, do we want to assert precedence semantically (error/success behavior) or structurally (constructor-argument capture)?
2. If Gemini E2E remains infeasible, should Sprint 007 still be considered complete with explicit defer documentation, or should that become Sprint 008 P0?
