# Sprint 002 Draft (Codex): Provider-Centric Settings with CLI/API Access Mode

## Sprint Goal
Ship a provider-centric agent configuration system that supports selectable access modes (CLI/API) where available, enforces capability gating based on detected access, and preserves the existing streaming chat UX across both transport paths.

## Scope

### In Scope
- Replace flat agent-centric settings with provider-centric sections: Anthropic, OpenAI, Google, GitHub.
- Add access-mode model to settings and runtime selection (`cli` / `api`) per provider-backed agent.
- Detect both CLI binaries and API key availability using login-shell environment.
- Enforce UI gating:
  - cannot enable when no access method is available
  - cannot select unavailable access mode
- Implement API execution path for:
  - Claude (Anthropic)
  - Codex/OpenAI
  - Gemini (API-only)
- Keep Copilot CLI-only.
- Hide extra CLI arguments input when API mode is selected.
- Re-scan action refreshes binary + environment-key availability in one pass.
- Keep streaming response experience consistent with current sidebar behavior.

### Out of Scope
- Provider-agnostic model catalog UI.
- User-entered API key storage in plugin settings.
- Conversation persistence redesign.
- New agents/providers beyond current four.
- Major chat UI redesign beyond required gating and labels.

## Intent Interpretation Locked for Sprint
- Claude: CLI + API supported.
- Codex/OpenAI: CLI + API supported.
- Gemini/Google: API only (CLI path removed from selectable runtime).
- Copilot/GitHub: CLI only.
- API keys are read from environment only via resolved login-shell env:
  - `OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY`
  - `OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_API_KEY`
  - `OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_API_KEY`

## Current-State Baseline
- `src/types.ts` has `AgentConfig` with only `enabled` + `extraArgs`.
- `src/settings.ts` renders one section per CLI adapter and assumes install status is binary (`isInstalled`).
- `src/AgentDetector.ts` currently detects command presence only (`which/where`).
- `src/AgentRunner.ts` is CLI-only with `spawn()` pipeline and `:::file-op` interception.
- Sidebar tabs are filtered by `config.enabled && detection.isInstalled`.

Sprint 002 must preserve this working baseline while adding API mode with minimal churn.

## Architecture Changes

### 1) Data Model Evolution (`src/types.ts`)
Introduce explicit access capability and selected mode.

Proposed additions:
- `type AccessMode = "cli" | "api"`
- `type ProviderId = "anthropic" | "openai" | "google" | "github"`
- Extend `AgentConfig`:
  - `accessMode?: AccessMode` (persisted, default resolved at load)
- Extend detection model from CLI-only status to capability flags per agent/provider:
  - `cliAvailable: boolean`
  - `apiAvailable: boolean`
  - `apiKeyEnvVar?: string`

Keep backward compatibility by migrating old settings in `loadSettings()`.

### 2) Provider Capability Registry (new constant module or `AgentRunner.ts`)
Define one canonical mapping that settings + detector + runner all consume.

Each entry should include:
- provider section metadata (id, label)
- agent id and display label
- CLI command (if any)
- API env var (if any)
- allowed modes
- default mode preference (`cli` when both exist)

This avoids drift between settings rendering and runtime logic.

### 3) Detection Layer Refactor (`src/AgentDetector.ts`)
Expand `detect/rescan` to produce both capabilities:
- CLI: existing absolute-path command detection.
- API: check env var existence and non-empty value from resolved login-shell env.

Implementation notes:
- Reuse a shared `resolveShellEnv()` utility (currently local in `AgentRunner.ts`) so detector and runner use identical env source.
- Preserve cache behavior, but cache full capability objects.
- Re-scan must invalidate and refresh both command and env signals.

### 4) Runner Split by Transport
Keep CLI runner intact for minimal risk; add API transport path behind a common interface.

Recommended shape:
- `AgentExecutionRunner` interface with `sendMessage(...)` and `dispose()`.
- `CliAgentRunner` = existing behavior (from current `AgentRunner` with minimal edits).
- `ApiAgentRunner` = provider-specific HTTP streaming implementation.

Selection rule:
- At tab creation, choose runner by persisted `accessMode` if available.
- If selected mode unavailable, auto-fallback to first available mode and persist corrected value.

### 5) API Streaming Strategy
Use raw `fetch` + stream readers, normalized into existing `token` / `complete` / `error` events.

Provider-specific transport adapters:
- Anthropic adapter: SSE/event-stream parse to text deltas.
- OpenAI adapter: streamed response parse to text deltas.
- Gemini adapter: streaming API parse to text deltas.

Constraints:
- Keep file-op protocol handling for API output identical to CLI path (`:::file-op` parser reuse).
- Keep debug mode output useful for API (request lifecycle + stream fragments, without logging secrets).

## Settings UX Plan (`src/settings.ts`)

### Section Structure
Render four provider sections in this order:
1. Anthropic
2. OpenAI
3. Google
4. GitHub

Each section includes:
- provider heading + sublabel (e.g., `Claude Code / API (Anthropic)`)
- availability badges for each supported mode
- enable toggle (disabled if no mode available)
- access mode radio (only render supported modes; disable unavailable mode)
- extra CLI args input only when selected mode is `cli`

### Mode Rules
- Both modes available: default/retain `cli`.
- Only CLI available: force `cli`.
- Only API available: force `api`.
- Neither available: disable enable toggle and mode controls.
- Gemini: only API control shown.
- Copilot: only CLI control shown.

### Re-scan Behavior
Single button refreshes full capability matrix and re-renders settings in place.

## Sidebar Integration (`src/AgentSidebarView.ts`)
Tab inclusion changes from `enabled && isInstalled` to:
- `enabled && (cliAvailable || apiAvailable)`

Runner construction changes:
- pick runner based on selected mode and capability.
- pass API key from resolved env only to API runner path.
- for CLI path, continue using detected absolute binary path and extra args.

## Incremental Execution Plan

### Phase 1: Types + Settings Migration
- Add `AccessMode` + capability fields.
- Add load-time migration for existing settings records.
- Keep defaults backward compatible.

### Phase 2: Capability Registry + Detector
- Create canonical provider capability map.
- Move shell env resolver into shared utility.
- Expand detector to emit CLI/API availability.

### Phase 3: Provider-Centric Settings UI
- Replace flat agents loop with provider section rendering.
- Implement enable/mode gating rules.
- Conditional CLI args field visibility.

### Phase 4: Runtime Mode Selection
- Introduce runner abstraction.
- Keep existing CLI runner path stable.
- Wire mode-based runner creation from sidebar.

### Phase 5: API Runners
- Implement Anthropic/OpenAI/Gemini streaming adapters.
- Normalize all adapters to existing token event model.
- Reuse file-op parsing pipeline.

### Phase 6: QA and Hardening
- Validate gating edge cases.
- Validate fallback when selected mode becomes unavailable.
- Validate no key leakage in logs/errors.

## Acceptance Criteria

1. Settings are grouped by provider headings: Anthropic, OpenAI, Google, GitHub.
2. Each provider shows capability state for supported access types.
3. Enable toggle is disabled when no supported access type is available.
4. Access mode selector cannot choose unavailable modes.
5. Gemini is API-only in UI and runtime.
6. Copilot is CLI-only in UI and runtime.
7. Claude and OpenAI support mode switching between CLI and API when both are available.
8. CLI args input is hidden when API mode is selected.
9. Re-scan refreshes both binary and env key detection.
10. Sidebar only shows enabled agents with at least one available access type.
11. API mode responses stream into chat incrementally (not only final blob).
12. Existing file-op cards continue to work for both CLI and API responses.

## Verification Matrix
- No env keys, no binaries: all providers disabled; no tabs.
- CLI only for Claude/OpenAI/Copilot: CLI selectable, API disabled.
- API only for Claude/OpenAI/Gemini: API selectable, CLI disabled.
- Both CLI+API for Claude/OpenAI: both radios enabled; CLI default.
- Gemini key removed after mode set to API: provider disabled after re-scan.
- Copilot binary removed while enabled: tab removed after re-scan.
- Attempt mouse/keyboard selection of disabled radio: selection rejected.
- Debug mode enabled with API path: logs show transport state without key value.

## Risks and Mitigations

1. Streaming protocol differences across provider APIs.
- Mitigation: isolate provider parsers behind small adapters and normalize events.

2. Settings/runtimes drift on capability changes.
- Mitigation: central capability registry + deterministic mode fallback on load/build tab.

3. Secret exposure in logs.
- Mitigation: never render API key values; redact auth headers; avoid full request dumps.

4. Regression in stable CLI flow.
- Mitigation: preserve current runner code path and add API path in parallel.

## Definition of Done
- All acceptance criteria pass in manual QA.
- TypeScript build succeeds.
- CLI mode remains functional for existing users without config reset.
- API mode works for Claude, OpenAI, Gemini with streaming output.
- Provider-centric settings UX enforces all gating rules.
- No API secrets are persisted to plugin data or displayed in UI/debug logs.

## Open Decisions (Resolve Early)
1. API client approach: SDKs vs raw `fetch`.
2. Default API models per provider.
3. Whether to keep `gemini` CLI adapter present internally but unreachable, or remove it fully.
4. Whether to add API-specific advanced options in this sprint or defer.
