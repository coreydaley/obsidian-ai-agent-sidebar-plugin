# Sprint 002 Intent: Provider-Centric Settings with CLI/API Access Mode

## Seed

we should not support API keys for claude, codex, and gemini. each section in the settings should detect the existence of an API key for each service, the key format should be OBSIDIAN_AI_AGENT_SIDEBAR_<regular key name>, there should be a toggle to enable/disable that agent, and then a radio button to either use the CLI or the API for requests. Since Copilot does not offer API key access, leave that one alone, and for Gemini, since the CLI doesn't work correctly, let's just support the API key. We also need to ensure that the option is not able to be selected via the radio button if that kind of access is not detected, and you can't enable an agent if no access type is detected. Let's also rename the sections in the settings to more generic like Anthropic, OpenAI, Google, Github, and then have the sub sections listed like "Claude Code" or API, Codex or API, etc.

> **Clarification**: "we should not support API keys" is read as "we SHOULD now support API keys" — i.e., the intent is to ADD API key support for Claude, Codex, and Gemini. Copilot remains CLI-only.

## Context

- SPRINT-001 delivered a working Obsidian plugin with multi-agent CLI chat sidebar
- All four agents (Claude Code, Codex, Gemini CLI, GitHub Copilot) are spawned as CLI subprocesses
- Settings currently shows a flat "Agents" list with enable toggle + extra CLI args per agent
- Detection is binary: `which <command>` via a login shell
- No API key support exists; all interactions go through CLIs
- The project is desktop-only (macOS/Linux/Win32); login-shell environment is resolved for PATH and env vars

## Recent Sprint Context

- **SPRINT-001**: Built the full plugin from scratch — multi-agent sidebar, streaming parser for `:::file-op` protocol, vault CRUD, settings with re-scan, shell injection guards, ANSI stripping, 8KB file context truncation. Status: Planning (full spec exists, implementation shipped).

## Relevant Codebase Areas

| File | Role |
|------|------|
| `src/types.ts` | AgentId, AgentConfig, AgentDetectionResult, PluginSettings |
| `src/settings.ts` | Settings UI (AgentSidebarSettingTab) + DEFAULT_SETTINGS |
| `src/AgentDetector.ts` | CLI binary detection via login-shell `which` |
| `src/AgentRunner.ts` | AGENT_ADAPTERS array + CLI subprocess spawner |
| `src/AgentChatTab.ts` | Per-agent chat UI; calls AgentRunner |
| `src/AgentSidebarView.ts` | Tab bar; filters by agent.enabled |

## Constraints

- Must follow project conventions in `~/.claude/CLAUDE.md` (Conventional Commits, no over-engineering)
- Must integrate with existing architecture (AgentDetector, AgentRunner, PluginSettings)
- Obsidian plugin environment — no Node.js `http` module restrictions (it's an Electron app), can use `fetch` or SDK packages
- API key env var format: `OBSIDIAN_AI_AGENT_SIDEBAR_<STANDARD_KEY_NAME>`
  - Anthropic/Claude: `OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY`
  - OpenAI/Codex: `OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_API_KEY`
  - Google/Gemini: `OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_API_KEY`
- Gemini: **API only** (CLI is unreliable, drop CLI support)
- Copilot: **CLI only** (no API access available)
- The shell environment resolver (`resolveShellEnv` in AgentRunner) already reads the login-shell env; API key detection should check this resolved env

## Provider → Agent Mapping

| Settings Section | CLI Agent Name | API Label | CLI Available | API Available |
|-----------------|----------------|-----------|--------------|---------------|
| **Anthropic** | Claude Code | API (Anthropic) | Yes (if `claude` binary found) | Yes (if env key set) |
| **OpenAI** | Codex | API (OpenAI) | Yes (if `codex` binary found) | Yes (if env key set) |
| **Google** | *(none — CLI dropped)* | Gemini API | No | Yes (if env key set) |
| **GitHub** | GitHub Copilot | *(none)* | Yes (if `copilot` binary found) | No |

## Success Criteria

1. Settings page groups agents under provider headings: Anthropic, OpenAI, Google, GitHub
2. Each provider section detects both CLI binary presence AND API key env var presence
3. Enable toggle is disabled (greyed out) when no access type is detected
4. Access mode radio (CLI / API) is rendered for providers with both options; unavailable modes are disabled
5. Gemini section shows API-only (no CLI radio option)
6. Copilot section shows CLI-only (no API radio option)
7. When API mode is selected, the AgentRunner uses HTTP/SDK calls instead of spawning a subprocess
8. API responses stream (SSE/chunks) just like CLI output — same streaming UX
9. Extra CLI args field is hidden when API mode is selected (N/A for API)
10. Re-scan button re-checks both CLI binaries and env vars

## Verification Strategy

- **Settings UI**: Manual inspection — check each provider section renders correctly, toggle states match detection results
- **Detection**: Unit-testable — mock env vars and binary presence, verify detection output
- **API runners**: Integration test with real keys (or mocked fetch); verify streamed tokens arrive
- **Access mode gating**: Attempt to select disabled radio option via keyboard/click — must be rejected
- **Enable gating**: Attempt to enable agent with no access type — toggle must remain disabled
- **Edge cases**:
  - Both CLI and API available → CLI is default
  - Only CLI available → CLI selected, API radio disabled
  - Only API available → API selected, CLI radio disabled
  - Neither available → enable toggle disabled, no radio shown (or both disabled)
  - Gemini with no API key → enable toggle disabled
  - Copilot CLI not found → enable toggle disabled

## Uncertainty Assessment

- **Correctness uncertainty**: Medium — API streaming requires care (SSE parsing for Anthropic/OpenAI, different for Gemini)
- **Scope uncertainty**: Low — seed is specific about what changes where
- **Architecture uncertainty**: Medium — introducing API runners alongside CLI runners; need clean abstraction

## Open Questions

1. Should the `accessMode` (CLI vs API) be persisted per agent in PluginSettings?
2. For API runners, should we add SDK packages (`@anthropic-ai/sdk`, `openai`, `@google/generative-ai`) or use raw `fetch`?
3. Should Gemini's adapter entry in AGENT_ADAPTERS be removed (since CLI is dropped), or kept as disabled?
4. What model defaults to use for API mode? (e.g., `claude-sonnet-4-6`, `gpt-4o`, `gemini-2.0-flash`)
5. Should the "Extra CLI arguments" field be replaced by an "Extra options" or "Model override" field for API mode?
