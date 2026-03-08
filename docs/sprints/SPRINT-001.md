# Sprint 001: Obsidian AI Agent Sidebar Plugin

## Overview

This sprint delivers a complete Obsidian community plugin that embeds a multi-agent AI chat sidebar directly into the editor. Users interact with CLI-based AI agents (Claude Code, Codex, Gemini CLI, Copilot) without leaving Obsidian, and those agents can read, create, update, rename, and delete vault files on the user's behalf.

The core design challenge is the **agent communication protocol**: CLI agents produce free-form text output, but the plugin must intercept structured file-operation intents. We solve this with a system prompt that instructs each agent to emit `:::file-op` JSON fence blocks alongside prose; a streaming parser intercepts these before rendering. Agents that do not comply fall back to text-only mode.

The second key decision is **tab architecture**: each enabled agent gets a persistent tab in a single `ItemView`. Tab state (conversation history) lives in memory for the session. The sidebar renders a tab bar + active chat pane, mirroring VSCode's chat panel UX.

This sprint targets **desktop only** (`isDesktopOnly: true`).

## Sprint Goal

Deliver a functional v1 Obsidian sidebar plugin where users can chat with enabled CLI AI agents, receive streaming responses, and safely execute vault CRUD operations via structured agent requests — all with a clean tabbed UI and persistent settings.

## Use Cases

1. **Ask about vault files**: "Summarize my meeting notes from last week" — agent reads matching files and responds.
2. **Create new notes**: "Create a note called 'Project Alpha Kickoff' with these action items" — agent emits a file-create tool call.
3. **Edit existing files**: "Add a TODO section to my daily note" — agent reads the file, emits a file-write tool call.
4. **Rename or delete files**: "Archive the old project notes" — agent emits rename or delete tool calls.
5. **Switch agents**: User is mid-conversation with Claude Code, switches to Gemini tab — each agent has its own independent conversation history.
6. **Configure agents**: Settings page shows detected agents with enable/disable toggles and per-agent options.

## Out of Scope

- Conversation persistence across restarts (in-memory only in v1; persistence toggle deferred to Sprint 002)
- Rich markdown rendering (basic text display only)
- Advanced auth/key management workflows
- Multi-vault orchestration
- Plugin marketplace release automation
- Per-agent system prompt customization by the user
- Mobile support (desktop-only declaration in manifest)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Obsidian App (Desktop)                │
│                                                         │
│  ┌─────────────────┐    ┌───────────────────────────┐  │
│  │  main.ts        │    │   AgentSidebarView         │  │
│  │  (Plugin)       │───▶│   (ItemView)               │  │
│  │                 │    │                             │  │
│  │  registerView() │    │  ┌──────────────────────┐  │  │
│  │  addRibbonIcon()│    │  │  Tab Bar             │  │  │
│  │  addSettingTab()│    │  │  [Claude][Codex][...] │  │  │
│  │  addCommand()   │    │  └──────────────────────┘  │  │
│  └────────┬────────┘    │  ┌──────────────────────┐  │  │
│           │             │  │  AgentChatTab (active)│  │  │
│           │             │  │  [message history]   │  │  │
│  ┌────────▼────────┐    │  │  [streaming tokens]  │  │  │
│  │  settings.ts    │    │  │  [input + send btn]  │  │  │
│  │  PluginSettings │    │  └──────────────────────┘  │  │
│  │  SettingTab     │    └──────────┬────────────────┘  │
│  │  loadData()     │               │                   │
│  │  saveData()     │               │                   │
│  └─────────────────┘    ┌──────────▼────────────────┐  │
│                         │  AgentRunner               │  │
│                         │  (child_process.spawn)     │  │
│                         │                             │  │
│                         │  stdin → prompt + context  │  │
│                         │  stdout → streaming parser  │  │
│                         │  :::file-op parser         │  │
│                         └──────────┬────────────────┘  │
│                                    │                   │
│                         ┌──────────▼────────────────┐  │
│                         │  FileOperationsHandler     │  │
│                         │  (app.vault API)           │  │
│                         │                             │  │
│                         │  read/create/write         │  │
│                         │  delete/rename/list        │  │
│                         │  + path traversal guard    │  │
│                         └───────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

                   AgentDetector
                   (which / PATH lookup)
                   Detects: claude, codex, gemini, copilot
```

### Agent Communication Protocol

Each agent is spawned with a system prompt that instructs it to emit file operations as `:::file-op` JSON fence blocks:

```
:::file-op
{"op": "read", "path": "relative/to/vault.md"}
:::

:::file-op
{"op": "write", "path": "notes/new-note.md", "content": "# New Note\n..."}
:::

:::file-op
{"op": "delete", "path": "archive/old.md"}
:::

:::file-op
{"op": "rename", "oldPath": "notes/draft.md", "newPath": "notes/final.md"}
:::

:::file-op
{"op": "list", "path": "folder/"}
:::
```

The streaming parser scans stdout for `:::file-op` / `:::` delimiters:
1. Parse the JSON block
2. Execute the operation via `FileOperationsHandler`
3. Inject the result back into the agent's stdin as a tool result message
4. Replace the raw block in the chat UI with a styled "file operation" indicator card

**Fallback**: If an agent does not emit structured blocks (non-compliant output), the plugin treats all output as plain text. CRUD operations are simply unavailable for that agent session.

### Agent Detection

| Agent | CLI Command | Detection Method |
|-------|------------|-----------------|
| Claude Code | `claude` | `which claude` |
| OpenAI Codex | `codex` | `which codex` |
| Gemini CLI | `gemini` | `which gemini` |
| GitHub Copilot | `copilot` | `which copilot` |

Detection runs once on plugin load and when the settings page opens. User can force re-scan. Results determine which agents appear in Settings as installed/unavailable.

### Auto-Context Injection

When a user opens the sidebar or sends a message, the currently active file's content is automatically prepended to the system prompt so the agent has immediate context about what the user is working on.

## Implementation Plan

### Phase 1: Project Scaffold (~15%)

**Files:**
- `package.json` — npm dependencies, build scripts
- `tsconfig.json` — TypeScript config
- `esbuild.config.mjs` — bundle to single `main.js`
- `manifest.json` — Obsidian plugin manifest (`isDesktopOnly: true`)
- `src/types.ts` — shared TypeScript interfaces
- `README.md` — basic plugin documentation

**Tasks:**
- [ ] Initialize npm project with Obsidian plugin template dependencies (`obsidian`, `typescript`, `esbuild`, `@types/node`)
- [ ] Configure esbuild for Obsidian plugin bundling (external: `obsidian`, `electron`, `node:*`)
- [ ] Write `manifest.json` with `id: "obsidian-ai-agent-sidebar"`, `isDesktopOnly: true`
- [ ] Define TypeScript interfaces: `AgentId`, `AgentConfig`, `AgentDetectionResult`, `ChatMessage`, `FileOp`, `FileOpResult`, `PluginSettings`

### Phase 2: Settings Infrastructure (~20%)

**Files:**
- `src/settings.ts` — `PluginSettings` type, `DEFAULT_SETTINGS`, `AgentSidebarSettingTab`

**Tasks:**
- [ ] Define `PluginSettings` schema:
  - `agents: Record<AgentId, AgentConfig>` (enabled, extraArgs)
  - `persistConversations: boolean` (toggle present, deferred implementation)
  - `workingDirectory?: string`
- [ ] Implement `AgentSidebarSettingTab extends PluginSettingTab`
- [ ] Settings UI: detected agents list with installed/not-installed status badge and enable/disable toggle
- [ ] Settings UI: per-agent extra CLI arguments (text input), with a help note: "Model selection is handled by the CLI agent's own configuration. To override, pass e.g. `--model claude-opus-4-5` here."
- [ ] Settings UI: "Re-scan installed agents" button
- [ ] Settings UI: conversation persistence toggle (displayed; note "coming in v2" if deferred)
- [ ] Wire `loadData()` / `saveData()` in main plugin

### Phase 3: Agent Detection (~10%)

**Files:**
- `src/AgentDetector.ts`

**Tasks:**
- [ ] Implement `detectInstalledAgents()` using `child_process.exec('which <cmd>')`
- [ ] Handle Windows fallback with `where`
- [ ] **Security**: Verify resolved binary path is absolute (starts with `/`); reject and mark as unavailable if `which` returns a relative path
- [ ] Return `AgentDetectionResult[]` with `{ id, name, command, path, isInstalled }`
- [ ] Cache results; expose `rescan(): Promise<AgentDetectionResult[]>` method

### Phase 4: Agent Runner (~20%)

**Files:**
- `src/AgentRunner.ts`

**Tasks:**
- [ ] Implement `AgentRunner` class wrapping `child_process.spawn`
- [ ] **Security**: Always call `child_process.spawn()` with `shell: false` and pass arguments as a string array — never construct shell command strings or use `exec()` with user-supplied content
- [ ] Define per-agent adapter config (flags, stdin mode, `processModel: "long-lived" | "one-shot"`) — each agent in a typed config map
- [ ] For one-shot agents: re-spawn per user message, passing full conversation history as context
- [ ] For long-lived agents: keep process alive, use `sendMessage(text)` for subsequent turns
- [ ] Prepend system prompt with vault path, auto-injected current file content (truncated to 8KB max), and `:::file-op` protocol instructions
- [ ] Implement streaming stdout reader with **stateful buffer** — accumulate chunks and search for delimiters across chunk boundaries (never assume delimiter arrives in a single chunk)
- [ ] Implement `:::file-op` / `:::` block detector in the buffered stream; handle partial/fragmented delimiters
- [ ] When block detected: parse JSON, call `FileOperationsHandler`, inject result back to agent stdin
- [ ] Strip file-op blocks from displayed output; emit styled operation-result event instead
- [ ] Emit events: `onToken(text)`, `onFileOpStart(op)`, `onFileOpResult(result)`, `onComplete()`, `onError(err)`
- [ ] Track all spawned processes in a `Set`; kill all on `dispose()` call
- [ ] Guard against race condition: if `dispose()` is called while a file op is in-flight, cancel the operation and return an error result to the agent

### Phase 5: File Operations Handler (~10%)

**Files:**
- `src/FileOperationsHandler.ts`

**Tasks:**
- [ ] Implement `FileOperationsHandler` wrapping `app.vault`
- [ ] **Path safety first**: use `path.resolve(vaultRoot, inputPath)` and verify the resolved path starts with `vaultRoot` (canonical check, not string matching); reject any path that resolves outside the vault, including symlink edge cases and rename targets
- [ ] `read(path)` → `vault.read(file)`
- [ ] `write(path, content)` → `vault.create()` or `vault.modify()`
- [ ] `delete(path)` → show Obsidian `Notice` confirmation pattern → `vault.delete(file)`
- [ ] `rename(oldPath, newPath)` → `vault.rename(file, newPath)`
- [ ] `list(path?)` → `vault.getAbstractFileByPath()` + list children
- [ ] Return `FileOpResult` with `{ ok, result?, error? }` for tool result injection

### Phase 6: Sidebar UI (~20%)

**Files:**
- `src/AgentSidebarView.ts`
- `src/AgentChatTab.ts`
- `src/styles.css`

**Tasks:**
- [ ] Implement `AgentSidebarView extends ItemView` (type: `"agent-sidebar-view"`)
- [ ] Render tab bar: one tab per enabled+installed agent
- [ ] Tab switching: instantiate `AgentChatTab` per agent, show/hide on switch; preserve state in memory
- [ ] Empty state: "No agents enabled — open Settings to get started"
- [ ] Unavailable agent state: tab shown as disabled with tooltip
- [ ] Implement `AgentChatTab`:
  - Render message history (user/assistant bubbles, timestamps)
  - Streaming token display: append tokens to last assistant bubble in real time
  - File op indicator cards: show operation name, path, success/error status
  - Input textarea: Enter to submit, Shift+Enter for newline
  - Send button
  - Loading indicator while agent is responding
  - Error state with "Retry" button when agent process fails

### Phase 7: Main Plugin Entry (~5%)

**Files:**
- `src/main.ts`

**Tasks:**
- [ ] Implement `AgentSidebarPlugin extends Plugin`
- [ ] `onload()`: load settings, run agent detection, register view, add ribbon icon, add setting tab, add command "Open AI Agent Sidebar"
- [ ] `onunload()`: dispose all `AgentRunner` instances (kills child processes)

## User Stories and Acceptance Criteria

**Story 1**: As a user, I can open an AI sidebar and switch between enabled agent tabs.
- [ ] Sidebar opens from ribbon icon and command palette
- [ ] Tabs shown only for enabled + installed agents
- [ ] Switching tabs preserves each tab's in-memory conversation

**Story 2**: As a user, I can send a prompt and receive a streaming response.
- [ ] Send action spawns agent process if not running
- [ ] Response tokens appear progressively in real time
- [ ] Process failures show a readable error state with retry option

**Story 3**: As a user, I can enable/disable agents from settings.
- [ ] Settings page shows all supported agents with installed/not-installed status
- [ ] Toggle changes persist across plugin reload
- [ ] Disabled agents disappear from sidebar tabs

**Story 4**: As a user, agent-requested vault file CRUD executes safely.
- [ ] `:::file-op` blocks are parsed and validated
- [ ] All operations use `app.vault` only — no raw `fs` calls on vault files
- [ ] Path traversal attempts (`../`) are rejected before dispatch
- [ ] Malformed JSON in file-op block is logged and treated as plain text
- [ ] Delete prompts user for confirmation before executing

**Story 5**: As a user, the current open file is automatically available to the agent.
- [ ] Active file content is injected into the system prompt on each new conversation start

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Create | npm dependencies and build scripts |
| `tsconfig.json` | Create | TypeScript compilation config |
| `esbuild.config.mjs` | Create | Bundle to single main.js |
| `manifest.json` | Create | Obsidian plugin manifest (desktop-only) |
| `README.md` | Create | Basic plugin documentation |
| `src/types.ts` | Create | Shared TypeScript interfaces |
| `src/settings.ts` | Create | Settings schema and settings tab UI |
| `src/AgentDetector.ts` | Create | Detect installed CLI agents |
| `src/AgentRunner.ts` | Create | Spawn agents, parse streaming output, handle file-op protocol |
| `src/FileOperationsHandler.ts` | Create | Vault CRUD with path safety |
| `src/AgentSidebarView.ts` | Create | Sidebar ItemView with tab bar |
| `src/AgentChatTab.ts` | Create | Per-agent chat UI component |
| `src/main.ts` | Create | Plugin entry point |
| `src/styles.css` | Create | Sidebar and chat styling |

## Definition of Done

- [ ] Plugin loads in Obsidian dev vault without errors (`npm run dev`)
- [ ] Sidebar opens via ribbon icon and command palette
- [ ] **All 4 agents detected** (`claude`, `codex`, `gemini`, `copilot`) correctly show as installed/not-installed in Settings (CRUD availability depends on protocol compliance)
- [ ] At least one CLI agent (Claude Code) works end-to-end: detect → send prompt → streaming response → CRUD file ops
- [ ] File `read` operation works: agent reads a vault file and uses its content
- [ ] File `write` operation works: agent creates or modifies a vault file; file-op indicator shown in chat UI
- [ ] File `delete` operation works with user confirmation prompt
- [ ] File `rename` operation works
- [ ] **Path traversal rejected via canonical resolution** (`path.resolve(vaultRoot, input)` check passes, not just string `..` check)
- [ ] **Chunk-boundary delimiter handling**: file-op blocks split across stream chunks are correctly assembled and parsed (no missed or double-processed ops)
- [ ] **Large-file truncation**: auto-injected file content is capped at 8KB; no crash or token overflow on large notes
- [ ] **Race condition safety**: plugin unload during in-flight file op does not corrupt vault or crash Obsidian
- [ ] **Extra CLI args validated**: user-supplied extra args do not contain shell injection characters (`;`, `&&`, `|`, `` ` ``, `$(...)`); blocked args show error in settings
- [ ] Settings page shows installed agents with enable/disable toggles
- [ ] Settings persist across plugin reload
- [ ] Tab switching preserves conversation history in memory
- [ ] Streaming response renders tokens in real time
- [ ] Malformed file-op JSON is handled gracefully (logged, shown as text; no crash)
- [ ] No TypeScript compilation errors
- [ ] No unhandled errors in normal operation (check Obsidian dev console)
- [ ] All agent processes killed cleanly on plugin unload
- [ ] `AgentRunner.spawn()` uses `shell: false` with arguments as a string array (verify in code review)

## Verification Matrix

| Test | Expected |
|------|----------|
| Plugin load/unload cycle | No errors, no orphaned processes |
| Open/close sidebar repeatedly | No memory leaks or duplicate views |
| Agent detection with binary installed | Shows as "Installed" in settings |
| Agent detection with binary missing | Shows as "Not installed" in settings |
| Enable/disable toggle + reload | State persists correctly |
| Send prompt → receive streaming response | Tokens append in real time |
| Agent emits `:::file-op read` | File content returned to agent |
| Agent emits `:::file-op write` | New/modified file appears in vault |
| Agent emits `:::file-op delete` | Confirmation shown → file deleted |
| Agent emits `:::file-op rename` | File renamed in vault |
| Agent emits `:::file-op list` | Directory listing returned |
| Malformed JSON in `:::file-op` block | Block treated as plain text; no crash |
| `:::file-op` block split across stream chunks | Block correctly reassembled and parsed |
| Repeated malformed ops in one session | Each handled independently; no cumulative state corruption |
| Path traversal `../` in file op | Rejected via canonical resolve; error result returned to agent |
| Path outside vault root in rename target | Rejected; error result returned to agent |
| Agent process exits unexpectedly | Error state shown with retry button |
| Plugin unload during in-flight file op | Op cancelled cleanly; no vault corruption |
| Large file (>8KB) as active note | Content truncated; no crash or spawn failure |
| Extra CLI args with `;` or `&&` | Blocked in settings with validation error |
| Switch agents mid-conversation | Each agent retains its own history |
| No agents enabled | Empty state message shown |
| Auto-context: open file injected | Active file content in system prompt (≤8KB) |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CLI agents change their invocation interface | Medium | High | Per-agent adapter config object; version-check on detection |
| Agent doesn't emit compliant `:::file-op` blocks | High | Medium | Fallback to text-only mode; user sees a notice |
| Agent process leaks on plugin unload | Low | High | Track all spawned processes in a `Set`; kill all in `onunload()` |
| Path traversal via malicious agent output | Low | Critical | Normalize + reject `..` patterns before any vault operation |
| Large file content blows up agent context window | Medium | Medium | Truncate auto-injected file content at a configurable max (e.g., 8KB) |
| Child process spawn fails (permissions, PATH) | Medium | Medium | Catch spawn errors; show actionable error with resolution hint |
| Copilot CLI has different interaction model | Medium | Low | `copilot` included with text-only fallback if structured protocol not supported |

## Security Considerations

- **Path traversal**: All file-op paths (including rename targets) must be resolved canonically using `path.resolve(vaultRoot, inputPath)` and verified to start with `vaultRoot`. String-only `..` checks are insufficient. `FileOperationsHandler` rejects any path that resolves outside the vault root. Symlink paths to locations outside the vault are a known gap in v1 (noted as limitation).
- **Shell injection — spawn**: `AgentRunner` must call `child_process.spawn()` with `shell: false` and pass all arguments as a string array. Never use `exec()` or construct shell command strings from user-supplied content.
- **Shell injection — CLI args**: User-supplied extra CLI args in settings are validated to reject shell metacharacters (`;`, `&&`, `||`, `|`, `` ` ``, `$(`, `>`). Validation runs on save; offending args are rejected with an error message.
- **Agent command integrity**: Agent commands are resolved via `which` to absolute binary paths detected at runtime. Relative paths returned by `which` are rejected. The absolute path is stored and used directly for `spawn()` — never re-resolved at spawn time.
- **Prompt injection via vault content**: Auto-injected vault content is a known prompt injection attack surface. The file-op indicator UI (which shows users what the agent is doing) is the primary defense. Auto-injected content is wrapped in clear delimiters in the system prompt to help agents distinguish it from instructions.
- **Destructive operations**: File delete requires explicit user confirmation via an Obsidian `Notice`-based confirmation before proceeding.
- **No API key storage**: Settings may include extra CLI args (e.g. `--model`), but must not store API keys. Users are responsible for having their CLI agents authenticated via their own credential mechanisms (e.g., `claude auth`, `gh auth login`).
- **Vault content disclosure**: When using this plugin, vault content (including the currently open note) is transmitted to the AI provider's servers by the CLI agent. Users should not use this plugin with notes containing confidential, PII, or sensitive information they do not want sent to third-party AI services. This disclosure is included in `README.md`.
- **Content visibility**: The file-op indicator card shown in the chat UI includes the operation type, path, and for writes, a preview of the content written. Users can see what the agent wrote before and after the operation executes.

## Open Decisions (Resolved Before Build)

1. **Protocol**: `:::file-op` JSON fence blocks (user-chosen in planning interview)
2. **Persistence**: In-memory conversations for v1; settings toggle present but deferred implementation
3. **Platform**: Desktop only (`isDesktopOnly: true` in manifest)
4. **Streaming**: Real-time token-by-token (user-chosen in planning interview)
5. **Auto-context**: Active file auto-injected into system prompt (user-chosen in planning interview)
6. **Copilot CLI**: Command is `copilot` (not `gh copilot`); text-only fallback if protocol non-compliant

## Critiques Addressed (Devil's Advocate Review)

The following concerns from the devil's advocate review were incorporated above:
- **Chunk-boundary parsing**: Phase 4 now requires a stateful buffer with explicit cross-chunk delimiter detection
- **File content truncation**: Phase 4 now specifies 8KB truncation of auto-injected content; added to DoD
- **Per-agent process model**: Phase 4 now requires explicit declaration of `long-lived` vs. `one-shot` per agent
- **Canonical path resolution**: Phase 5 now requires `path.resolve()` check, not string matching
- **All 4 agents detected**: DoD now requires detection of all 4 agents (CRUD requires protocol compliance)
- **Race condition on unload**: Phase 4 and DoD now include in-flight file op cancellation on dispose
- **Extra CLI arg injection**: Phase 2, Security Considerations, and DoD now require arg validation
- **Content visibility**: Security section now requires file-op indicator to show write preview

The following concerns were reviewed and not incorporated:
- **"Scope too large"**: Scope is intentionally ambitious; DoD defines the acceptance bar precisely
- **"Dependencies: None" is false**: Updated to document external dependencies honestly; not sprint-blocking
- **"Content trusted = security risk"**: Content visibility (file-op indicator) provides the needed transparency without blocking writes
- **"sendMessage impossible for one-shot CLIs"**: Addressed by per-agent `processModel` config; one-shot agents re-spawn per message

## Post-Sprint Backlog (Sprint 002 candidates)

- Conversation persistence across restarts
- Rich markdown rendering in chat bubbles
- Per-agent system prompt customization
- Advanced streaming UX polish (scroll-lock, auto-scroll behavior)
- Full-modal delete confirmation (vs. Notice-based)
- API key secure storage via OS keychain integration
- Automated test harness

## Dependencies

No prior sprints. External dependencies (not sprint-blocking, but requiring operational readiness):
- At least one supported CLI agent installed and authenticated on the development machine
- Obsidian desktop app available for plugin dev-mode testing
- Node.js with `npm` for build tooling

Note: The plugin itself does not depend on any specific agent being installed at runtime — all agents are optional. The DoD requires detection correctness for all 4 agents, but does not require all 4 to be installed on the developer's machine.
