# Sprint 002: Provider-Centric Settings with CLI/API Access Mode

**Status:** Completed

## Overview

SPRINT-001 delivered a fully-functional multi-agent CLI sidebar. Every agent interaction goes through a spawned subprocess. This sprint extends the plugin to support **direct API access** as an alternative to CLI, restructures the settings page around **provider groupings** (Anthropic, OpenAI, Google, GitHub), and enforces strict capability gating so users can only enable what they actually have access to.

Three changes drive this sprint:

1. **Provider-centric settings UI** — replace the flat "Agents" list with sections grouped by provider, each showing detected CLI and API availability and offering an access-mode radio control.
2. **API transport path** — a new `AgentApiRunner` implements the same streaming interface as the CLI runner, calling each provider's API directly via official SDKs.
3. **Model selection** — when API mode is activated, the plugin fetches available models from the provider and presents a dropdown; the selected model is persisted.

Copilot remains CLI-only (no public API). Gemini CLI is dropped (unreliable); Gemini is API-only.

## Use Cases

1. **API-only user**: Has `OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY` set but no Claude Code CLI. Plugin detects API key, enables Anthropic in API mode.
2. **CLI-only user**: Has Claude Code CLI installed, no API key. Anthropic section defaults to CLI mode. SPRINT-001 behaviour unchanged.
3. **Both available**: User has Claude CLI + API key. Both radio options enabled; CLI is the default.
4. **Gemini user**: Only API mode is offered. User sets `OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_API_KEY`, selects a model from the dropdown.
5. **Copilot user**: CLI-only section; no API radio or env var detection.
6. **Nothing detected**: All provider sections show greyed-out enable toggles with "not detected" messaging.

## Architecture

```
src/
├── providers.ts          (NEW) Canonical provider/agent capability registry
├── shellEnv.ts           (NEW) Shared resolveShellEnv() utility
├── AgentApiRunner.ts     (NEW) API streaming runner (Anthropic, OpenAI, Gemini)
├── runnerFactory.ts      (NEW) Factory: pick AgentRunner or AgentApiRunner by accessMode
├── types.ts              (MODIFY) Add AccessMode, ProviderId, extend AgentConfig + DetectionResult
├── AgentDetector.ts      (MODIFY) Add API key detection; use shared shellEnv
├── AgentRunner.ts        (MODIFY) Implement AgentExecutionRunner interface; use shared shellEnv
├── settings.ts           (MODIFY) Provider-grouped UI with radio, model dropdown, gating
└── AgentSidebarView.ts   (MODIFY) Use runnerFactory; update tab inclusion logic
```

### Provider Capability Registry (`src/providers.ts`)

Single source of truth consumed by settings, detector, and runner factory:

```typescript
interface ProviderConfig {
  id: ProviderId;                      // "anthropic" | "openai" | "google" | "github"
  label: string;                       // "Anthropic", "OpenAI", etc.
  agentId: AgentId;                    // maps to existing settings key
  agentLabel: string;                  // "Claude Code", "Codex", "Gemini", "GitHub Copilot"
  cliCommand?: string;                 // "claude", "codex", "copilot" | undefined for Google
  cliSupported: boolean;
  apiSupported: boolean;
  apiKeyEnvVar?: string;               // e.g. "OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY"
  defaultMode: AccessMode;             // "cli" when both available, "api" if only API
  defaultModel: string;                // fallback if model fetch fails
  listModelsEndpoint?: string;         // URL to fetch available models
}
```

### Runner Interface

```typescript
interface AgentExecutionRunner {
  run(messages: ChatMessage[], context: string): Promise<void>;
  dispose(): void;
}
// Events (EventEmitter pattern, same as current AgentRunner):
// token(text), stderr(text), complete(), error(err), fileOpStart(op), fileOpResult(op, result)
```

### Detection Model

```typescript
interface AgentDetectionResult {
  id: AgentId;
  name: string;
  command: string;           // CLI command (may be empty string for API-only)
  path: string;              // resolved binary path ("" if not found)
  isInstalled: boolean;      // CLI binary found
  hasApiKey: boolean;        // API key env var exists and is non-empty
  apiKeyVar: string;         // env var name (e.g. "OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY")
}
```

### Settings Data Model

```typescript
type AccessMode = "cli" | "api";
type ProviderId = "anthropic" | "openai" | "google" | "github";

interface AgentConfig {
  enabled: boolean;
  accessMode: AccessMode;    // NEW - persisted
  selectedModel?: string;    // NEW - persisted API model selection
  extraArgs: string;         // existing - only used in CLI mode
}
```

## Implementation Plan

### Phase 1: Shared Utilities & Types (~10%)

**Files:**
- `src/types.ts`
- `src/shellEnv.ts` (new)

**Tasks:**
- [ ] Add `AccessMode = "cli" | "api"` and `ProviderId` to `types.ts`
- [ ] Add `hasApiKey`, `apiKeyVar` fields to `AgentDetectionResult`
- [ ] Add `accessMode`, `selectedModel` to `AgentConfig`
- [ ] Add `apiKeyVar` to `AgentAdapterConfig` (optional)
- [ ] Extract `resolveShellEnv()` from `AgentRunner.ts` into `src/shellEnv.ts`
- [ ] Update `AgentRunner.ts` to import from `shellEnv.ts`
- [ ] Update `DEFAULT_SETTINGS` — `accessMode: "cli"` per agent; `selectedModel: undefined`
- [ ] Add settings migration in `loadSettings()` for users upgrading from SPRINT-001

### Phase 2: Provider Capability Registry (~8%)

**Files:**
- `src/providers.ts` (new)

**Tasks:**
- [ ] Define `ProviderConfig` interface
- [ ] Export `PROVIDERS: ProviderConfig[]` — Anthropic, OpenAI, Google, GitHub
  - Anthropic: cliCommand=`claude`, apiKeyEnvVar=`OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY`, cliSupported=true, apiSupported=true
  - OpenAI: cliCommand=`codex`, apiKeyEnvVar=`OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_API_KEY`, cliSupported=true, apiSupported=true
  - Google: cliSupported=false, apiSupported=true, apiKeyEnvVar=`OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_API_KEY`
  - GitHub: cliCommand=`copilot`, cliSupported=true, apiSupported=false
- [ ] Define default models: `claude-sonnet-4-6`, `gpt-4o`, `gemini-2.0-flash`
- [ ] Update `AGENT_ADAPTERS` in `AgentRunner.ts` to use registry or remove Gemini CLI entry

### Phase 3: Detection Refactor (~10%)

**Files:**
- `src/AgentDetector.ts`

**Tasks:**
- [ ] Import `resolveShellEnv` from `shellEnv.ts`
- [ ] Update `detectOne` to also check API key env var from resolved shell env
- [ ] Populate `hasApiKey` and `apiKeyVar` in detection results
- [ ] Skip CLI detection for Google (no CLI command)
- [ ] Update cache to store full capability objects
- [ ] Verify re-scan refreshes both CLI path and API key status

### Phase 4: Provider-Centric Settings UI (~25%)

**Files:**
- `src/settings.ts`

**Tasks:**
- [ ] Replace flat agent loop with provider-grouped rendering using `PROVIDERS` registry
- [ ] For each provider, render:
  - [ ] Provider heading (e.g., "Anthropic") + sub-label (e.g., "Claude Code / API")
  - [ ] CLI detection badge (show only if `cliSupported`)
  - [ ] API key detection badge (show only if `apiSupported`)
  - [ ] Access mode radio: "Claude Code (CLI)" / "API" (render only supported modes; disable unavailable ones)
  - [ ] Enable toggle — disabled if neither `isInstalled` nor `hasApiKey`
  - [ ] Extra CLI args field — visible only in CLI mode
  - [ ] Model dropdown — visible only in API mode (see Phase 7)
- [ ] Implement radio gating: if selected mode is unavailable, auto-correct to available mode on render
- [ ] Re-scan button re-checks both binary and env var
- [ ] For Google: render API section only, no CLI radio
- [ ] For GitHub: render CLI section only, no API radio

### Phase 5: Runner Interface & Factory (~10%)

**Files:**
- `src/AgentRunner.ts`
- `src/runnerFactory.ts` (new)

**Tasks:**
- [ ] Define and export `AgentExecutionRunner` interface in `types.ts`
- [ ] Update `AgentRunner` class to implement `AgentExecutionRunner`
- [ ] Create `src/runnerFactory.ts`:
  - `createRunner(agentId, settings, detectionResults, resolvedEnv): AgentExecutionRunner`
  - Routes to `AgentRunner` (CLI) or `AgentApiRunner` (API) based on `accessMode`
  - **Security**: extract only the specific `OBSIDIAN_AI_AGENT_SIDEBAR_*` key from `resolvedEnv` before passing to API runner; do not pass full env object
  - Re-validate capability at call time (not just at settings render); if selected mode no longer available, emit `error` immediately
- [ ] Update `AgentSidebarView` to use `runnerFactory`
- [ ] Update tab inclusion: `enabled && (isInstalled || hasApiKey)` instead of `enabled && isInstalled`

### Phase 6: API Runners (~35%)

**Files:**
- `src/AgentApiRunner.ts` (new)
- `src/providers/AnthropicProvider.ts` (new)
- `src/providers/OpenAIProvider.ts` (new)
- `src/providers/GeminiProvider.ts` (new)

**Tasks:**
- [ ] Install SDK packages: `npm install @anthropic-ai/sdk openai @google/generative-ai`
- [ ] Verify SDKs work in Obsidian/Electron runtime (no Node.js modules unavailable in Electron renderer)
- [ ] Define `ProviderAdapter` interface (extracted so `AgentApiRunner` is a thin dispatcher, not a god class):
  ```typescript
  interface ProviderAdapter {
    stream(messages: ChatMessage[], context: string, model: string): AsyncIterable<string>;
    listModels(): Promise<string[]>;
  }
  ```
- [ ] Implement `AnthropicProvider`:
  - `stream()`: use `@anthropic-ai/sdk` `client.messages.stream()`; convert `ChatMessage[]` to Anthropic message format (user/assistant turns, system as top-level param)
  - `listModels()`: `GET /v1/models`, return `id` list
- [ ] Implement `OpenAIProvider`:
  - `stream()`: use `openai` `client.chat.completions.create({ stream: true })`; convert `ChatMessage[]` to OpenAI format (system as `{role:"system"}` first)
  - `listModels()`: `GET /v1/models`, filter to `gpt-*` and `o*` series
- [ ] Implement `GeminiProvider`:
  - `stream()`: use `@google/generative-ai` `model.generateContentStream()`; map `ChatMessage[]` to `Content[]` (note: Gemini requires alternating user/model turns, no system role)
  - `listModels()`: `GET /v1beta/models`, filter to models with `generateContent` capability
- [ ] Create `AgentApiRunner` class implementing `AgentExecutionRunner`:
  - Constructor: `agentId`, `apiKey`, `model`, `providerAdapter`, `fileOpsHandler`
  - `run()` iterates `AsyncIterable<string>` from adapter, emits `token` events
  - Applies `:::file-op` parser to streamed text (reuse from AgentRunner)
  - 30-second inactivity timeout — emit `error` if no token received
  - Catch and sanitise SDK exceptions before emitting `error` (scrub any string containing the API key value)
  - In debug mode: log provider, model, first-token latency, total tokens — redact key to `[REDACTED]`
- [ ] Emit API errors (auth 401/403, quota 429, timeout) as `error` events with provider-specific messages
- [ ] **Security**: Install SDK packages with pinned exact versions (no `^` or `~` ranges in `package.json`)
- [ ] **Security**: Run `npm audit` after install; resolve any high/critical severity findings before proceeding
- [ ] **Security**: Validate `selectedModel` against known format (regex: `/^[\w\.\-]+$/`) before passing to SDK; reject unknown-format strings
- [ ] **Security**: Ensure `resolveShellEnv()` module-level cache is not exported; only the function is exported

### Phase 7: Model Selection Dropdown (~10%)

**Files:**
- `src/settings.ts`
- `src/AgentChatTab.ts`

**Tasks:**
- [ ] In settings, when API mode selected, render model dropdown (loading state while fetching)
- [ ] Fetch model list via `ProviderAdapter.listModels()` with 10-second timeout
- [ ] Cache model list per session (invalidated on Re-scan); do not re-fetch on every settings open
- [ ] If fetch fails or times out: populate dropdown with hardcoded defaults; display non-blocking warning
- [ ] Persist selected model in `settings.agents[id].selectedModel`
- [ ] Pass selected model to `AgentApiRunner` via runner factory
- [ ] When access mode switches (CLI ↔ API) and conversation is non-empty: show confirmation dialog ("Switch to API mode? Current conversation will be cleared."); only clear if user confirms
- [ ] `resolveShellEnv()` failures (e.g., shell spawn error): fall back to `process.env` gracefully; do not crash detection

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/types.ts` | Modify | Add `AccessMode`, `ProviderId`, `AgentExecutionRunner`, `ProviderAdapter` interfaces; extend `AgentConfig` and `AgentDetectionResult` |
| `src/shellEnv.ts` | Create | Shared `resolveShellEnv()` utility (extracted from AgentRunner); falls back to `process.env` on error |
| `src/providers.ts` | Create | Canonical provider/agent capability registry (`PROVIDERS` array) |
| `src/AgentDetector.ts` | Modify | Add API key env var detection; use shared shellEnv |
| `src/AgentRunner.ts` | Modify | Implement `AgentExecutionRunner` interface; remove Gemini CLI entry; use shared shellEnv |
| `src/AgentApiRunner.ts` | Create | Thin dispatcher; iterates `ProviderAdapter.stream()`, applies file-op parser, handles timeout/cancellation |
| `src/providers/AnthropicProvider.ts` | Create | Anthropic streaming + model listing via `@anthropic-ai/sdk` |
| `src/providers/OpenAIProvider.ts` | Create | OpenAI streaming + model listing via `openai` |
| `src/providers/GeminiProvider.ts` | Create | Gemini streaming + model listing via `@google/generative-ai` |
| `src/runnerFactory.ts` | Create | Factory function: select CLI or API runner by `accessMode`; validates capability at call time |
| `src/settings.ts` | Modify | Provider-grouped UI: radio, model dropdown with loading/cache, capability gating, extra args visibility |
| `src/AgentSidebarView.ts` | Modify | Use `runnerFactory`; update tab inclusion to `enabled && (isInstalled || hasApiKey)` |

## Definition of Done

### Settings & Detection
- [ ] Settings page shows four provider sections in order: Anthropic, OpenAI, Google, GitHub
- [ ] Each section correctly shows CLI and/or API detection state (badge text: "detected" / "not detected" — not "valid" — to set correct expectations)
- [ ] Detection badge tooltip clarifies: "Key detected in shell environment. Validity is confirmed on first use."
- [ ] Access mode radio buttons are disabled for unavailable modes
- [ ] Enable toggle is disabled when no access type detected; user cannot enable without access
- [ ] Google (Gemini) section: API-only UI, no CLI radio shown
- [ ] GitHub (Copilot) section: CLI-only UI, no API radio shown
- [ ] Re-scan refreshes both CLI binary detection and API key env var detection
- [ ] If persisted `accessMode` becomes unavailable after re-scan, plugin auto-corrects to available mode
- [ ] Gemini: if user previously had Gemini enabled (from SPRINT-001 CLI), settings migration auto-migrates to API mode if key detected, or disables if not

### Model Selection
- [ ] When API mode is selected, model dropdown shows; populated by live provider API fetch with 10-second timeout
- [ ] Model fetch shows a loading indicator while in progress; does not block other settings interaction
- [ ] Model dropdown falls back to hardcoded defaults if fetch fails; non-blocking warning shown in settings
- [ ] Model fetch result is cached per session (re-scan or explicit re-fetch, not on every settings open)
- [ ] Selected model is persisted in plugin settings
- [ ] Switching access mode (CLI ↔ API) shows confirmation dialog if current conversation is non-empty before clearing

### API Runner
- [ ] API mode streams tokens to the chat UI incrementally (not a final blob)
- [ ] `:::file-op` protocol parsing is applied to API text output (same as CLI path)
- [ ] API auth failures (401, 403, invalid key) display a clear error message in chat (not a silent hang or crash)
- [ ] API quota/rate-limit errors (429) display a clear error message in chat
- [ ] Stuck/stalled streams time out after 30 seconds and emit an error event displayed in chat
- [ ] Running stream can be cancelled (stop button or agent disable); resources are cleaned up
- [ ] In debug mode: log provider, model, request start/end, and error class — but never the API key value (redact to `[REDACTED]`)
- [ ] SDK exceptions that may embed auth tokens are caught and sanitised before display

### CLI Mode Stability
- [ ] CLI mode behaviour is unchanged from SPRINT-001 (regression check)
- [ ] Extra CLI args field is hidden in API mode; visible in CLI mode as before

### Data & Security
- [ ] API keys are never persisted to disk; never written to plugin settings
- [ ] Settings migration: SPRINT-001 users' existing settings (`enabled`, `extraArgs`) load without error; new fields default correctly
- [ ] TypeScript compiles without errors or warnings
- [ ] No unhandled console errors during normal operation (CLI or API path)

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SSE/streaming format differences between providers | Medium | High | Each provider uses its own SDK; isolate parsing behind provider-specific methods |
| SDK bundle size bloat (three provider SDKs) | Medium | Low | Obsidian plugins run in Electron; bundle size is less critical; tree-shake where possible |
| API key not in resolved shell env (set after shell load) | Low | Medium | Document clearly in settings UI: "Keys must be set in your shell profile (.zshrc, .bash_profile)" |
| Model list fetch fails (network issue, bad key) | Medium | Low | Fall back to hardcoded defaults; show non-blocking warning in settings |
| Regression in stable CLI flow from runner refactor | Low | High | CLI path minimally changed; extract interface only — no logic change to spawn/streaming |
| Settings migration breaks existing config | Low | High | Write explicit migration in `loadSettings()`; add fallback defaults for all new fields |
| Gemini API response format version change | Medium | Medium | Use versioned endpoint; abstract parsing in provider method |
| Runner factory picks wrong runner on startup | Low | Medium | If `accessMode` is invalid for current capabilities, fallback logic corrects it deterministically |

## Security Considerations

- **API keys never stored**: Keys are read from the resolved shell environment at runtime — never written to Obsidian's plugin data files or any disk storage
- **No key display**: The settings UI shows only "detected" / "not detected" status for API keys, never the key value
- **Debug mode key masking**: In debug mode, log request lifecycle events but replace key value with `[REDACTED]` in any auth header logging
- **No user-configurable endpoints**: All API calls go to hardcoded provider endpoints; no user-supplied URLs in this sprint (prevents SSRF via settings)
- **Shell env namespace isolation**: The `OBSIDIAN_AI_AGENT_SIDEBAR_` prefix prevents accidental detection of unrelated secrets (e.g., `ANTHROPIC_API_KEY` without the prefix is not detected)
- **Existing CLI security unchanged**: Shell injection guards, canonical path validation, and spawn-with-`shell:false` remain intact

## Dependencies

- SPRINT-001 complete — foundation architecture in place
- New npm packages: `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`
- No Obsidian API changes required — all new functionality uses existing plugin lifecycle hooks

## Verification Matrix

| Scenario | Expected result |
|----------|----------------|
| No env keys, no binaries | All providers show disabled enable toggle; sidebar shows no tabs |
| Claude CLI only | Anthropic section: CLI radio selected, API radio disabled; enable works |
| Anthropic API key only | Anthropic section: API radio selected, CLI radio disabled; enable works |
| Both Claude CLI + API key | Anthropic section: both radios enabled, CLI pre-selected |
| Gemini API key set | Google section: API radio visible (no CLI radio); enable works; model dropdown shown |
| Gemini API key removed, re-scan | Google section: enable toggle becomes disabled |
| Copilot binary found | GitHub section: CLI radio visible (no API radio); enable works |
| API model fetch fails | Dropdown shows hardcoded defaults; settings warning displayed |
| Mode switched CLI → API | Current chat conversation is cleared |
| Re-scan after binary removed | Radio for CLI mode becomes disabled; if was active mode, auto-corrects to API (if available) |
| Debug mode + API call | Logs show request/response lifecycle; API key value is `[REDACTED]` |
| Existing SPRINT-001 settings load | Migration applies; `accessMode: "cli"`, `selectedModel: undefined` set for all agents; no errors |

## Critiques Addressed

*From Codex's review of the Claude draft:*

- **Runner factory location**: Moved to `src/runnerFactory.ts` called from `AgentSidebarView`, not `AgentChatTab` ✓
- **Event name alignment**: `AgentExecutionRunner` interface uses existing names: `token`, `stderr`, `complete`, `error`, `fileOpStart`, `fileOpResult` ✓
- **Canonical capability registry**: `src/providers.ts` is now first-class ✓
- **Shared `resolveShellEnv`**: Extracted to `src/shellEnv.ts`, imported by both detector and runner ✓
- **Extra CLI args scope**: Scoped to settings panel only ✓
- **Model dropdown scope**: Retained despite Codex suggestion to defer — explicitly confirmed by product owner ✓

*From Codex's devil's advocate review:*

- **API key presence ≠ validity**: Settings badge now says "detected" not "valid"; tooltip clarifies detection checks presence only; auth failures display clear error messages in chat ✓
- **AgentApiRunner god class**: Refactored to per-provider `ProviderAdapter` classes; `AgentApiRunner` is a thin dispatcher ✓
- **Model fetch UX risks**: Added 10-second timeout, loading indicator, per-session caching, graceful fallback ✓
- **Conversation clear confirmation**: Confirmation dialog required when conversation is non-empty before clearing ✓
- **30-second stream timeout**: Added to DoD and Phase 6 tasks ✓
- **Auth error DoD items**: Added explicit DoD criteria for 401/403/429 error display ✓
- **Debug mode key redaction**: Strengthened to also sanitise SDK exceptions that may embed key values ✓
- **resolveShellEnv fallback**: Falls back to `process.env` gracefully if shell spawn fails ✓
- **Gemini migration**: Settings migration handles existing Gemini CLI state ✓
- **One env var assumption**: Accepted as sprint-scope limitation; enterprise/proxy support is a future sprint ✓
- **Single AgentApiRunner for all providers**: Rejected (ProviderAdapter pattern adopted instead) ✓
