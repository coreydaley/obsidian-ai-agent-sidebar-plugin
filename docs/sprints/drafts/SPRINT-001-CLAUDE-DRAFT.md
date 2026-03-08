# Sprint 001: Obsidian AI Agent Sidebar Plugin

## Overview

This sprint delivers a complete Obsidian community plugin that embeds a multi-agent AI chat sidebar directly into the editor. Users interact with powerful CLI-based AI agents (Claude Code, Codex, Gemini CLI, GitHub Copilot) without leaving Obsidian, and those agents can read, create, update, and delete vault files on the user's behalf.

The core design challenge is the **agent communication protocol**: CLI agents produce free-form text output, but the plugin needs to intercept structured intents (file operations). We solve this by wrapping each agent invocation with a system prompt that instructs the agent to emit JSON tool-call blocks alongside prose, and a streaming parser that intercepts those blocks before rendering to the chat UI.

The second key design decision is the **tab architecture**: each enabled agent gets a persistent tab in the sidebar `ItemView`. Tab state (conversation history) lives in memory for the session. The sidebar itself is a single registered `ItemView` that renders a tab bar + active chat pane — mirroring VSCode's chat panel UX.

## Use Cases

1. **Ask about vault files**: User asks "summarize my meeting notes from last week" — agent reads matching files and responds.
2. **Create new notes**: User asks "create a note called 'Project Alpha Kickoff' with these action items" — agent emits a file-create tool call.
3. **Edit existing files**: User asks "add a TODO section to my daily note" — agent reads the file, emits a file-write tool call with updated content.
4. **Delete files**: User asks "clean up all empty notes in the archive folder" — agent lists, then emits file-delete tool calls.
5. **Switch agents**: User is mid-conversation with Claude Code, switches to Gemini tab — each agent has its own independent conversation history.
6. **Configure agents**: User opens Settings → AI Agent Sidebar, sees which agents are installed, enables/disables them, sets per-agent options.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Obsidian App                          │
│                                                         │
│  ┌─────────────────┐    ┌───────────────────────────┐  │
│  │  Plugin Main    │    │   AgentSidebarView         │  │
│  │  (main.ts)      │───▶│   (ItemView)               │  │
│  │                 │    │                             │  │
│  │  registerView() │    │  ┌──────────────────────┐  │  │
│  │  addRibbonIcon()│    │  │  Tab Bar             │  │  │
│  │  addSettingTab()│    │  │  [Claude][Codex][...] │  │  │
│  └────────┬────────┘    │  └──────────────────────┘  │  │
│           │             │  ┌──────────────────────┐  │  │
│           │             │  │  Chat Pane (active)  │  │  │
│  ┌────────▼────────┐    │  │  [message history]   │  │  │
│  │  Settings       │    │  │  [input box]         │  │  │
│  │  (settings.ts)  │    │  └──────────────────────┘  │  │
│  │                 │    └──────────┬────────────────┘  │
│  │  loadData()     │               │                   │
│  │  saveData()     │               │                   │
│  └─────────────────┘    ┌──────────▼────────────────┐  │
│                         │  AgentRunner               │  │
│                         │  (child_process.spawn)     │  │
│                         │                             │  │
│                         │  stdin → user message      │  │
│                         │  stdout → streaming parser  │  │
│                         └──────────┬────────────────┘  │
│                                    │                   │
│                         ┌──────────▼────────────────┐  │
│                         │  FileOperationsHandler     │  │
│                         │  (app.vault API)           │  │
│                         │                             │  │
│                         │  read / create / write     │  │
│                         │  delete / list / rename    │  │
│                         └───────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Agent Communication Protocol

CLI agents are invoked with a **wrapper system prompt** prepended to each conversation. The prompt instructs agents to emit file operations as fenced JSON blocks:

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
{"op": "list", "path": "folder/"}
:::
```

The streaming parser scans stdout for `:::file-op` / `:::` delimiters. When a block is detected:
1. Parse JSON
2. Execute the operation via `FileOperationsHandler`
3. Inject the result back into the agent's stdin as a tool result
4. Strip the raw block from the displayed chat output (show a styled "file op" indicator instead)

### Agent Detection

`AgentDetector` uses `which` (POSIX) / `where` (Windows) to detect installed agents:

| Agent | Command | Detection |
|-------|---------|-----------|
| Claude Code | `claude` | `which claude` |
| OpenAI Codex | `codex` | `which codex` |
| Gemini CLI | `gemini` | `which gemini` |
| GitHub Copilot | `gh` | `which gh` + `gh copilot --version` |

Detection runs once on plugin load and on settings page open. Results are cached; user can force re-scan.

## Implementation Plan

### Phase 1: Project Scaffold (~15%)

**Files:**
- `package.json` — dependencies, build scripts
- `tsconfig.json` — TypeScript config
- `esbuild.config.mjs` — bundle config (single main.js output)
- `manifest.json` — Obsidian plugin manifest
- `src/types.ts` — shared interfaces

**Tasks:**
- [ ] Initialize npm project with Obsidian plugin template dependencies
- [ ] Configure esbuild for Obsidian plugin bundling
- [ ] Write `manifest.json` with plugin metadata
- [ ] Define core TypeScript interfaces: `AgentConfig`, `ChatMessage`, `FileOp`, `PluginSettings`

### Phase 2: Settings Infrastructure (~20%)

**Files:**
- `src/settings.ts` — `PluginSettings` type, `DEFAULT_SETTINGS`, `AgentSidebarSettingTab`

**Tasks:**
- [ ] Define `PluginSettings` schema (enabled agents, per-agent config, global options)
- [ ] Implement `AgentSidebarSettingTab extends PluginSettingTab`
- [ ] Settings UI: detected agents list with enable/disable toggles
- [ ] Settings UI: per-agent configuration (model, extra args)
- [ ] Settings UI: global options (working directory, conversation persistence toggle)
- [ ] Wire `loadData()` / `saveData()` in main plugin

### Phase 3: Agent Detection (~10%)

**Files:**
- `src/AgentDetector.ts`

**Tasks:**
- [ ] Implement `detectInstalledAgents()` using `child_process.exec('which <cmd>')`
- [ ] Handle Windows fallback with `where`
- [ ] Return `AgentDetectionResult[]` with name, path, version string
- [ ] Cache results; expose `rescan()` method

### Phase 4: Agent Runner (~20%)

**Files:**
- `src/AgentRunner.ts`

**Tasks:**
- [ ] Implement `AgentRunner` class wrapping `child_process.spawn`
- [ ] Prepend system prompt with vault context and file-op protocol instructions
- [ ] Implement streaming stdout reader with `:::file-op` block parser
- [ ] Emit events: `onToken(text)`, `onFileOp(op)`, `onComplete()`, `onError(err)`
- [ ] Handle agent process lifecycle (start, send message, kill on tab close)
- [ ] Implement per-agent invocation signatures (different CLI flags per agent)

### Phase 5: File Operations Handler (~10%)

**Files:**
- `src/FileOperationsHandler.ts`

**Tasks:**
- [ ] Implement `FileOperationsHandler` wrapping `app.vault`
- [ ] `readFile(path)` → `vault.read(file)`
- [ ] `writeFile(path, content)` → `vault.create()` or `vault.modify()`
- [ ] `deleteFile(path)` → `vault.delete(file)`
- [ ] `listFolder(path)` → `vault.getAbstractFileByPath()` + children
- [ ] Return structured results back to AgentRunner for tool result injection
- [ ] Confirm destructive operations (delete) with user via Notice/Modal

### Phase 6: Sidebar UI (~20%)

**Files:**
- `src/AgentSidebarView.ts`
- `src/styles.css`

**Tasks:**
- [ ] Implement `AgentSidebarView extends ItemView`
- [ ] Register view with type `agent-sidebar-view`
- [ ] Render tab bar: one tab per enabled agent
- [ ] Tab switching: preserve scroll position and conversation state per tab
- [ ] Chat pane: render message history (user/assistant bubbles)
- [ ] Input box: textarea + send button, Enter to submit (Shift+Enter for newline)
- [ ] Streaming token display: append tokens to last assistant message in real time
- [ ] File op indicators: show styled inline card when a file op executes
- [ ] Empty state: "No agents enabled — go to Settings to enable agents"
- [ ] Error state: agent process crashed, show retry button

### Phase 7: Main Plugin Entry (~5%)

**Files:**
- `src/main.ts`

**Tasks:**
- [ ] Implement `AgentSidebarPlugin extends Plugin`
- [ ] `onload()`: load settings, detect agents, register view, add ribbon icon, add setting tab, add command to open sidebar
- [ ] `onunload()`: kill any running agent processes

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Create | npm dependencies and build scripts |
| `tsconfig.json` | Create | TypeScript compilation config |
| `esbuild.config.mjs` | Create | Bundle to single main.js |
| `manifest.json` | Create | Obsidian plugin manifest |
| `src/types.ts` | Create | Shared TypeScript interfaces |
| `src/settings.ts` | Create | Settings schema and UI |
| `src/AgentDetector.ts` | Create | Detect installed CLI agents |
| `src/AgentRunner.ts` | Create | Spawn agents, parse output |
| `src/FileOperationsHandler.ts` | Create | Vault CRUD operations |
| `src/AgentSidebarView.ts` | Create | Sidebar ItemView with tab UI |
| `src/main.ts` | Create | Plugin entry point |
| `src/styles.css` | Create | Sidebar and chat styling |

## Definition of Done

- [ ] Plugin loads in Obsidian without errors (dev mode via `npm run dev`)
- [ ] Sidebar opens via ribbon icon and command palette
- [ ] At least one CLI agent (Claude Code) detected and functional end-to-end
- [ ] User message → agent response flow works with streaming display
- [ ] File read operation works: agent can read a vault file and incorporate its content
- [ ] File write operation works: agent can create/modify a vault file
- [ ] File delete operation works with confirmation dialog
- [ ] Settings page shows installed agents with enable/disable toggles
- [ ] Settings persist across plugin reload
- [ ] Tab switching between agents preserves conversation history
- [ ] No TypeScript compilation errors
- [ ] No console errors during normal operation
- [ ] Graceful degradation when no agents installed (shows helpful message)

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CLI agents change their invocation interface | Medium | High | Abstract per-agent invocation behind an interface; version-check on detection |
| Agent output parsing fragile (LLMs don't always follow format) | High | Medium | Defensive parser with fallback to treating all output as text; log malformed blocks |
| Obsidian API changes break plugin | Low | High | Pin obsidian npm package version; follow community plugin update practices |
| Child process spawning fails on some OS/permission configs | Medium | Medium | Catch spawn errors, show actionable error messages to user |
| Large vault context blows up agent context window | Medium | Medium | Inject only relevant file paths in system prompt, not full content |
| Agent process leaks on plugin unload | Low | High | Track all spawned processes in a Set, kill all in `onunload()` |
| Mobile Obsidian doesn't support child_process | High | Low | Detect mobile at runtime (`Platform.isMobile`), disable CLI agent tabs gracefully |

## Security Considerations

- File paths from agent output must be validated against the vault root (prevent path traversal)
- Agent commands are fixed strings from detection, never constructed from user input
- Destructive operations (delete) require explicit user confirmation
- No API keys stored in plugin settings in plaintext — use OS keychain or warn users
- Content written to vault files is treated as trusted (user explicitly requested it)

## Dependencies

- None (first sprint)

## Open Questions

1. **File-op protocol robustness**: The `:::file-op` delimiter scheme is simple but fragile. Should we use a more structured approach (e.g., require agents to output valid JSON Lines, or use a named pipe / IPC socket)?
2. **Conversation context injection**: Should we automatically inject the current open file's content into the system prompt, or require the user to explicitly reference files?
3. **Per-agent system prompt customization**: Should users be able to customize the system prompt per agent, or is this too advanced for v1?
4. **Copilot integration**: GitHub Copilot CLI (`gh copilot suggest`) has a very different interaction model than the other agents. Should it be included in v1 or deferred?
