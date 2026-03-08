# Sprint 002: Provider-Centric Settings with CLI/API Access Mode

## Overview

SPRINT-001 shipped a fully-functional multi-agent CLI sidebar. Every agent interaction goes through a spawned subprocess (the CLI tool). This sprint extends the plugin to support **direct API access** as an alternative to the CLI, giving users flexibility when a CLI tool isn't installed or when they prefer to call the provider's API directly.

The settings page will be restructured from a flat "Agents" list into **provider-grouped sections** (Anthropic, OpenAI, Google, GitHub). Each section detects independently whether CLI access (binary on PATH) and/or API access (env var with a well-known key) is available. An access-mode radio control gates which transport is used, and the enable toggle is blocked if no access type is detected at all.

Architecturally, we'll introduce a thin `AgentApiRunner` alongside the existing `AgentRunner`, sharing the same event interface so `AgentChatTab` can use either transparently. API streaming will be implemented using the providers' native streaming SDKs/SSE, matching the real-time token experience of the CLI path.

## Use Cases

1. **API-only user**: Has `OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY` set but hasn't installed Claude Code CLI. Plugin detects API key, enables Anthropic section in API mode automatically.
2. **CLI-only user**: Has Claude Code CLI installed, no API key set. Plugin detects binary, enables Anthropic in CLI mode. Existing behaviour unchanged.
3. **Both available**: User has both CLI and API key. Settings shows both radio options enabled; CLI is the default (preserving SPRINT-001 behaviour).
4. **Gemini user**: Gemini CLI is unreliable, so only API mode is offered. User sets `OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_API_KEY` and enables Google/Gemini.
5. **Copilot user**: Copilot has no public API. Settings shows CLI-only; no API radio or env var detection.
6. **Nothing detected**: All provider sections show greyed-out enable toggles. User sees clear "not detected" state prompting them to install a CLI or set an API key.

## Architecture

```
Settings UI (settings.ts)
  └─ Provider Sections (Anthropic, OpenAI, Google, GitHub)
       ├─ Detection: CliDetection (binary) + ApiKeyDetection (env var)
       ├─ Radio: accessMode = "cli" | "api"
       └─ Enable toggle

AgentChatTab
  └─ calls: getRunner(agentId) → AgentRunner | AgentApiRunner
       ├─ AgentRunner (existing): spawns CLI subprocess, emits tokens
       └─ AgentApiRunner (new): calls provider API via fetch/SDK, emits tokens

types.ts
  ├─ AgentConfig: + accessMode: "cli" | "api"
  └─ AgentDetectionResult: + hasApiKey: boolean + apiKeyVar: string

AgentDetector
  └─ detectOne: also checks process.env[apiKeyVar] (resolved shell env)
```

### Data flow for API mode

```
User sends message
  → AgentChatTab.sendMessage()
  → AgentApiRunner.run(messages, context)
      → fetch(providerEndpoint, { headers: {Authorization: key}, body: ... })
      → ReadableStream / SSE parsing
      → emit("token", text) per chunk
  → AgentChatTab displays tokens in real time (same as CLI path)
```

## Implementation Plan

### Phase 1: Types & Detection (~20%)

**Files:**
- `src/types.ts` — extend types
- `src/AgentDetector.ts` — add API key detection

**Tasks:**
- [ ] Add `accessMode: "cli" | "api"` to `AgentConfig` interface
- [ ] Add `hasApiKey: boolean` and `apiKeyVar: string` to `AgentDetectionResult`
- [ ] Add `apiKeyVar` to `AgentAdapterConfig` (optional; absent for Copilot/Gemini-CLI)
- [ ] Update `AgentDetector.detectOne` to check the resolved shell env for the API key var
- [ ] Remove Gemini from AGENT_ADAPTERS CLI list (or mark `cliSupported: false`) since CLI is dropped
- [ ] Update `DEFAULT_SETTINGS` to include `accessMode: "cli"` per agent

### Phase 2: Settings UI Restructure (~30%)

**Files:**
- `src/settings.ts` — full restructure of `renderAgentsSection`

**Tasks:**
- [ ] Replace flat agent loop with provider-grouped rendering
- [ ] Add provider headings: Anthropic, OpenAI, Google, GitHub
- [ ] For each provider section:
  - [ ] Show CLI detection status (binary found / not found) — skip for Google
  - [ ] Show API key detection status (env var found / not found) — skip for GitHub/Copilot
  - [ ] Render access mode radio (CLI / API) only when provider supports both; disable unavailable options
  - [ ] Render enable toggle; disable if neither CLI nor API key is detected
  - [ ] Show subsection label ("Claude Code" for CLI, "API" for API mode) dynamically
  - [ ] Hide Extra CLI args when access mode is API
- [ ] Update Re-scan to also re-check env vars (already does via `rescan → detectOne`)

### Phase 3: API Runner (~35%)

**Files:**
- `src/AgentApiRunner.ts` — new file
- `src/AgentRunner.ts` — minor: export shared event interface

**Tasks:**
- [ ] Create `AgentApiRunner` class implementing same event emitter interface as `AgentRunner`
  - `run(messages: ChatMessage[], context: string): Promise<void>`
  - emits: `token`, `stderr`, `done`, `error`, `fileOpStart`, `fileOpEnd`
- [ ] Implement Anthropic streaming:
  - POST to `https://api.anthropic.com/v1/messages` with SSE (`stream: true`)
  - Headers: `x-api-key`, `anthropic-version`, `content-type`
  - Parse `data:` lines, extract `delta.text` from `content_block_delta` events
  - Emit each text chunk as `token`
- [ ] Implement OpenAI streaming:
  - POST to `https://api.openai.com/v1/chat/completions` with `stream: true`
  - Parse SSE `data:` lines, extract `choices[0].delta.content`
  - Emit each chunk as `token`
- [ ] Implement Gemini streaming:
  - POST to `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`
  - Query param: `key={apiKey}` or Bearer auth
  - Parse JSON stream, extract `candidates[0].content.parts[0].text`
  - Emit each chunk as `token`
- [ ] Default models: `claude-sonnet-4-6`, `gpt-4o`, `gemini-2.0-flash` (hardcoded defaults, overridable later)
- [ ] Pass conversation history as messages array (same multi-turn format as CLI)
- [ ] Inject vault file context as system message (same 8KB truncation as CLI)

### Phase 4: Integration (~15%)

**Files:**
- `src/AgentChatTab.ts` — use correct runner based on accessMode
- `src/AgentRunner.ts` — no change to core, minor export cleanup

**Tasks:**
- [ ] In `AgentChatTab`, replace direct `AgentRunner` instantiation with a factory
  - If `settings.agents[id].accessMode === "api"` → use `AgentApiRunner`
  - Else → use existing `AgentRunner`
- [ ] Pass resolved API key (from shell env) to `AgentApiRunner` constructor
- [ ] Hide/disable "Extra CLI arguments" input in chat if in API mode
- [ ] Ensure tab status (enabled/disabled) still driven by `settings.agents[id].enabled`

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/types.ts` | Modify | Add `accessMode` to AgentConfig, `hasApiKey`/`apiKeyVar` to detection types |
| `src/AgentDetector.ts` | Modify | Check API key env var in resolved shell env during detection |
| `src/AgentRunner.ts` | Modify | Add `apiKeyVar` to adapters; remove/mark Gemini CLI as unsupported |
| `src/settings.ts` | Modify | Restructure into provider-grouped sections with radio + gating logic |
| `src/AgentApiRunner.ts` | Create | API streaming runner for Anthropic, OpenAI, Gemini |
| `src/AgentChatTab.ts` | Modify | Factory-select runner based on accessMode |

## Definition of Done

- [ ] Settings page shows four provider sections: Anthropic, OpenAI, Google, GitHub
- [ ] Each section correctly detects CLI and/or API key availability
- [ ] Access mode radio disabled for unavailable modes
- [ ] Enable toggle disabled when no access type detected
- [ ] Gemini section: API-only, no CLI radio
- [ ] Copilot section: CLI-only, no API radio
- [ ] Re-scan refreshes both CLI and API key detection
- [ ] API mode sends messages to provider API and streams tokens to UI
- [ ] CLI mode behaviour unchanged from SPRINT-001
- [ ] Extra CLI args hidden in API mode
- [ ] `accessMode` persisted in plugin settings
- [ ] TypeScript compiles without errors
- [ ] No console errors during normal operation

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SSE parsing differences between providers | Medium | High | Implement and test each provider separately; use well-known SSE format |
| Obsidian's Content Security Policy blocking fetch to external APIs | Low | High | Electron disables renderer CSP for local plugins; main process fetch should work |
| Resolved shell env not containing API key (key set after shell load) | Low | Medium | Document that keys must be in shell profile; provide clear "not detected" message |
| Gemini API response format changes | Medium | Medium | Use versioned endpoint; abstract parsing behind a function |
| Access mode radio state inconsistency (e.g., CLI disappears after re-scan) | Low | Medium | Re-scan resets accessMode to valid option if current selection becomes unavailable |

## Security Considerations

- API keys are read from the **resolved shell environment** — never stored in plugin settings or written to disk by this plugin
- API keys are passed at runtime to fetch headers; not logged unless debug mode is on (and even then, should be masked)
- No new shell injection surface — API mode bypasses CLI entirely
- fetch calls go to known provider endpoints only; no user-configurable endpoint URLs in this sprint
- The env var prefix `OBSIDIAN_AI_AGENT_SIDEBAR_` provides namespace isolation from accidentally exposing other secrets

## Dependencies

- SPRINT-001 (complete) — foundation architecture in place
- New npm dependencies: `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`

## Interview Refinements

*Answers from the planning interview:*

1. **SDK packages** — use `@anthropic-ai/sdk`, `openai`, `@google/generative-ai` for type safety and built-in streaming support.
2. **Model dropdown** — when API mode is selected, fetch available models from the provider API and populate a dropdown. User selects from the list. Persist the selected model in settings. Replace the "Extra CLI arguments" field with this dropdown in API mode.
3. **Mode switch clears chat** — switching access mode (CLI ↔ API) clears the current conversation in that agent tab.

## Open Questions (Resolved)

1. ~~SDK vs raw fetch~~ → **Provider SDKs**
2. ~~Model text field~~ → **Model dropdown populated by API call**; persisted in settings
3. **Gemini adapter**: Keep in AGENT_ADAPTERS with `cliSupported: false` flag
4. **accessMode persistence**: Yes — persist in PluginSettings
5. **Error display for API failures**: Emit as chat message (same as CLI failure)
