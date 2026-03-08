# Sprint 001 Intent: Obsidian AI Agent Sidebar Plugin

## Seed

Build a plugin for Obsidian (https://obsidian.md) that creates a sidebar where you can chat with an AI Agent about the files in your Vault and have it perform CRUD operations on the files. The user should be able to choose from installed CLI agents such as Claude Code, Codex, Gemini, or Copilot. There should be a settings page that allows for some basic configurations and showing what CLI Agents are installed and you can enable/disable them from showing in the sidebar. The sidebar should let you switch between the enabled agent tabs at any time similar to the chat function available in VSCode.

## Context

This is a greenfield Obsidian plugin project. No existing code, dependencies, or infrastructure exists. The plugin must conform to the Obsidian plugin API (TypeScript) and follow Obsidian community plugin conventions.

**Key architectural constraints:**
- Obsidian plugins are TypeScript compiled to a single `main.js`
- Plugins use the Obsidian API (`obsidian` npm package) for file operations, UI, settings
- Plugin lifecycle: `onload()` / `onunload()` on the main Plugin class
- UI components: `ItemView` for sidebar panels, `PluginSettingTab` for settings
- File operations: `app.vault` API (read, write, create, delete, rename, list)
- CLI agents (Claude Code, Codex, Gemini, Copilot) are invoked as child processes

## Recent Sprint Context

No prior sprints — this is the first sprint for a new project.

## Relevant Codebase Areas

No existing code. Will establish:
- `src/main.ts` — plugin entry point, registers views and commands
- `src/AgentSidebarView.ts` — ItemView for the sidebar panel container
- `src/AgentChatTab.ts` — per-agent chat tab component
- `src/AgentRunner.ts` — spawns and manages CLI agent child processes
- `src/AgentDetector.ts` — detects installed CLI agents (which, PATH lookup)
- `src/FileOperationsHandler.ts` — bridges agent CRUD requests to vault API
- `src/settings.ts` — settings schema, defaults, SettingTab UI
- `src/types.ts` — shared TypeScript types/interfaces

## Constraints

- Must follow Obsidian plugin API conventions (TypeScript, single-bundle output)
- Must use `app.vault` for all file operations (never raw `fs` for vault files)
- Child process spawning requires Node.js `child_process` — available in Obsidian desktop
- Must not break Obsidian mobile (graceful degradation if CLI agents unavailable)
- Settings must persist via `plugin.loadData()` / `plugin.saveData()`
- Must follow Conventional Commits for all git commits
- Must not commit secrets or credentials

## Success Criteria

- User can open a sidebar in Obsidian showing tabs for each enabled AI agent
- User can type a message and have it sent to the selected CLI agent
- Agent responses appear in the chat UI
- Agent can perform CRUD operations on vault files (read, create, update, delete)
- Settings page shows detected CLI agents with enable/disable toggles
- Settings page allows basic configuration (e.g., model selection, working directory)
- Tab switching works smoothly like VSCode's chat panel

## Verification Strategy

- **Manual testing**: Load plugin in Obsidian dev mode, verify all UI flows
- **Agent detection**: Test with each CLI agent installed/uninstalled
- **CRUD operations**: Verify each operation (create/read/update/delete) against real vault files
- **Settings persistence**: Verify settings survive plugin reload
- **Edge cases**: No agents installed, agent crashes mid-conversation, large files, special characters in filenames

## Uncertainty Assessment

- **Correctness uncertainty**: Medium — Obsidian API is well-documented but child process + IPC with CLI agents requires careful protocol design
- **Scope uncertainty**: Medium — "basic configurations" and CRUD protocol are underspecified
- **Architecture uncertainty**: High — How CLI agents communicate structured CRUD intents back to the plugin is the core unsolved design problem

## Open Questions

1. **Agent communication protocol**: How does the plugin know when an agent wants to create/delete a file vs. just responding with text? Does the agent emit structured JSON tool calls? Or does the plugin parse agent output for file operation markers?
2. **What constitutes "basic configuration"** in settings? Per-agent model selection? API keys? Working directory?
3. **Obsidian mobile**: Should the plugin gracefully degrade (hide CLI tabs) or explicitly target desktop only?
4. **Conversation persistence**: Should chat history persist across Obsidian restarts?
5. **Streaming responses**: Should agent output stream token-by-token or wait for completion?
