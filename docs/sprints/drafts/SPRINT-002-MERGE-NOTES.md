# Sprint 002 Merge Notes

## Claude Draft Strengths
- Complete use-case enumeration (6 scenarios covering all detection combinations)
- Strong security considerations (API key never persisted, masked in debug)
- Clear per-provider access matrix table
- Concrete API endpoint details for each provider
- Interview-confirmed decisions: SDK packages, model dropdown, clear chat on mode switch

## Codex Draft Strengths
- **Canonical capability registry** concept — single source of truth consumed by settings, detector, and runner
- **Shared `resolveShellEnv()` utility** — extract from AgentRunner, use in both detector and runner
- **`AgentExecutionRunner` interface** — formal interface with correct existing event names
- **Runner factory in `AgentSidebarView`** — not in `AgentChatTab` (correct per current codebase)
- **Fallback logic**: if persisted `accessMode` becomes unavailable after re-scan, auto-fall back to available mode
- **Phase ordering**: types → registry → detector → settings UI → runtime wiring → API runners → QA
- `ProviderId` type addition
- Settings migration for backward compat

## Valid Critiques Accepted
1. **Runner factory location**: Move to `AgentSidebarView` (or dedicated factory), not `AgentChatTab` ✓
2. **Event name alignment**: Use existing names (`complete`, `fileOpResult`, not `done`/`fileOpEnd`) ✓
3. **Canonical capability registry**: Add as first-class module (`src/providers.ts`) ✓
4. **Shared `resolveShellEnv`**: Extract to `src/shellEnv.ts` ✓
5. **Extra CLI args scope**: Only in settings panel, not chat UI ✓
6. **Fallback on re-scan**: If active mode becomes unavailable, auto-correct to available mode ✓

## Critiques Rejected (with reasoning)
1. **"Defer model dropdown"**: Codex suggested deferring to a future sprint, but the user explicitly confirmed this feature during the planning interview. It stays in scope.
2. **"Keep SDK-vs-fetch as open"**: User confirmed SDK packages. This is resolved.
3. **"Defer mode-switch chat clearing"**: User confirmed clear-chat on mode switch. Stays.

## Interview Refinements Applied
- SDK packages: `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`
- Model dropdown populated by live API call when API mode is selected; persisted in settings
- Access mode switch clears current chat conversation

## Final Decisions
1. New file `src/providers.ts` — canonical provider/agent capability registry
2. New file `src/shellEnv.ts` — shared `resolveShellEnv()` utility (extracted from AgentRunner)
3. New file `src/AgentApiRunner.ts` — API streaming runner implementing `AgentExecutionRunner` interface
4. Rename existing `AgentRunner` behavior to implement same `AgentExecutionRunner` interface
5. Runner factory function in `AgentSidebarView` (or `src/runnerFactory.ts`)
6. Model selection: dropdown populated by provider's list-models endpoint; default models as fallback if fetch fails
7. `accessMode` and `selectedModel` persisted in `AgentConfig`
8. `ProviderId` type: `"anthropic" | "openai" | "google" | "github"`
9. Phase order: types → providers registry → shell env → detector → settings UI → runner interface → API runners → sidebar integration → model dropdown → QA
