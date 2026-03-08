# Sprint 001 Draft (Codex): Obsidian AI Agent Sidebar Plugin

## Sprint Goal
Deliver a functional first version of an Obsidian sidebar plugin where users can chat with enabled local CLI agents (Claude Code, Codex, Gemini, Copilot), receive responses in a per-agent tab UI, and safely execute vault CRUD operations via structured agent requests.

## Sprint Scope

### In Scope
- Bootstrap a valid Obsidian community plugin TypeScript project that compiles to `main.js`
- Add a sidebar `ItemView` with tabbed agent switching
- Implement per-agent chat sessions with message history in-memory
- Detect installed CLI agents and expose enable/disable toggles in settings
- Spawn selected agent as child process and capture output
- Define and implement v1 structured file-operation protocol for agent -> plugin actions
- Execute vault CRUD using `app.vault` API only
- Persist plugin settings with `loadData()/saveData()`
- Graceful desktop/mobile behavior (no crash on mobile; agent features disabled where unsupported)
- Manual test checklist for end-to-end flows

### Out of Scope
- Rich markdown rendering (basic text/markdown display only)
- Advanced auth/key management workflows
- Multi-vault orchestration
- Conversation persistence across restarts (defer unless trivial)
- Full streaming token UI polish (can support line/chunk append without advanced UX)
- Plugin marketplace release automation

## Design Principles
- Keep architecture modular so each agent integration can evolve independently
- Prefer explicit structured protocol over brittle text parsing
- Default to safe file operations with path validation and vault boundary checks
- Degrade gracefully when prerequisites are unavailable
- Build smallest viable feature set that proves the product loop

## Planned Deliverables

### Core Files
- `src/main.ts`
- `src/types.ts`
- `src/settings.ts`
- `src/AgentSidebarView.ts`
- `src/AgentChatTab.ts`
- `src/AgentDetector.ts`
- `src/AgentRunner.ts`
- `src/FileOperationsHandler.ts`

### Supporting Project Files
- `package.json`
- `tsconfig.json`
- `esbuild.config.mjs` (or equivalent build script)
- `manifest.json`
- `README.md`

## Architecture Draft

### Plugin Layer
- `main.ts`
- Owns plugin lifecycle (`onload`, `onunload`)
- Registers sidebar view and settings tab
- Initializes detector/runner/handlers

### UI Layer
- `AgentSidebarView.ts`
- Renders tab strip of enabled agents
- Hosts active `AgentChatTab`
- Handles tab switching and session isolation

- `AgentChatTab.ts`
- Renders messages, input, send action, loading/error state
- Forwards prompts to `AgentRunner`
- Receives plain text and tool-call events

### Agent Integration Layer
- `AgentDetector.ts`
- Desktop: detects executables via `which`/`where` strategy
- Mobile: returns unavailable status

- `AgentRunner.ts`
- Spawns selected CLI process
- Sends prompt payload
- Parses stdout/stderr lines
- Emits events: `text`, `toolCall`, `complete`, `error`

### File Safety Layer
- `FileOperationsHandler.ts`
- Validates operation schema
- Verifies normalized path remains inside vault
- Executes `read/create/update/delete/rename/list` via `app.vault`
- Returns structured operation result/error to runner/UI

### Shared Contracts
- `types.ts`
- Agent identifiers, message types, settings types
- Tool-call schema for file operations

## v1 Agent Tool-Call Protocol

### Transport Assumption
Agents emit newline-delimited JSON envelopes on stdout when requesting file operations.

### Envelope
```json
{
  "type": "tool_call",
  "id": "call_123",
  "tool": "vault",
  "action": "read",
  "args": {
    "path": "notes/todo.md"
  }
}
```

### Supported Actions (Sprint 001)
- `read`: `{ path }`
- `create`: `{ path, content }`
- `update`: `{ path, content }`
- `delete`: `{ path }`
- `rename`: `{ oldPath, newPath }`
- `list`: `{ path? }`

### Response Envelope Back to Agent
```json
{
  "type": "tool_result",
  "id": "call_123",
  "ok": true,
  "result": { "content": "..." },
  "error": null
}
```

If an agent cannot emit structured JSON yet, fallback mode is text-only chat (no CRUD).

## User Stories and Acceptance Criteria

1. As a user, I can open an AI sidebar and switch between enabled agent tabs.
- Sidebar view is registerable from Obsidian UI.
- Tabs are shown only for enabled + available agents.
- Switching tabs preserves each tab's in-memory messages.

2. As a user, I can send a prompt to the selected agent and receive a response.
- Send action invokes configured agent command.
- Response text appears in active chat timeline.
- Process failures surface a readable error state.

3. As a user, I can enable/disable agents from settings.
- Settings page lists supported agents with detected status.
- Toggle changes persist across plugin reload.
- Disabled agents disappear from sidebar tabs.

4. As a user, agent-requested vault file CRUD executes safely.
- Structured tool call is parsed and validated.
- Operation uses `app.vault` APIs only.
- Invalid paths/actions return explicit error results.

5. As a user on unsupported/mobile environments, plugin fails safely.
- Plugin loads without crash.
- Agent features are marked unavailable.
- Existing notes functionality is unaffected.

## Implementation Plan (Ordered)

### Milestone 1: Project Bootstrap
- Initialize TypeScript Obsidian plugin skeleton
- Add build pipeline and manifest
- Verify plugin loads in Obsidian dev vault

### Milestone 2: Settings + Agent Detection
- Implement settings schema/defaults
- Build settings tab with agent status and toggles
- Implement detector service and refresh action

### Milestone 3: Sidebar + Tabs + Chat UI
- Implement `ItemView` container
- Implement per-agent tab chat component
- Wire prompt submission and response rendering

### Milestone 4: Agent Runner + Protocol
- Implement child-process orchestration
- Parse mixed stdout stream (text + JSON envelopes)
- Add tool-call execution loop and result return channel

### Milestone 5: File Operations Safety
- Implement file action handlers with strict validation
- Add path normalization/guardrails
- Add user-visible operation failures

### Milestone 6: Hardening + Manual QA
- Execute verification matrix
- Fix reliability and UX blockers
- Document known limitations and next-sprint backlog

## Verification Plan

### Manual Matrix
- Plugin load/unload lifecycle
- Open/close sidebar view repeatedly
- Agent detection with installed/uninstalled binaries
- Enable/disable toggles persist after restart
- Send prompt and receive response for each available agent
- CRUD operations:
  - Create new file
  - Read existing file
  - Update file
  - Rename file
  - Delete file
  - List directory
- Error paths:
  - Agent executable missing
  - Agent exits non-zero
  - Malformed JSON tool call
  - Attempted path traversal (`../`)
- Mobile launch check (no hard crash, features disabled)

### Definition of Done
- All in-scope acceptance criteria pass manually
- Build produces valid `main.js` and plugin loads in Obsidian
- No vault file operation bypasses `app.vault`
- Settings and enabled-agent state persist
- Key limitations documented in README and sprint notes

## Risk Register

1. Protocol mismatch across CLI agents
- Risk: Agents differ in IO behavior and tool-call capabilities.
- Mitigation: Introduce per-agent adapter config and text-only fallback.

2. Child process lifecycle instability
- Risk: Hanging processes or orphaned subprocesses.
- Mitigation: Timeouts, explicit disposal on tab/plugin unload, kill-on-unload.

3. Unsafe path/file actions
- Risk: Accidental writes outside expected vault paths.
- Mitigation: Normalize + validate all paths, reject traversal patterns.

4. Mobile incompatibility
- Risk: Node APIs unavailable in mobile runtime.
- Mitigation: Runtime capability checks and feature gating.

## Open Decisions for Sprint 001 Execution

1. Canonical JSON protocol contract per agent
- Decision needed: single cross-agent envelope vs adapter-specific transforms.

2. Baseline settings list
- Proposed minimum: command path, default model, enabled toggle, optional working dir.

3. Conversation retention policy
- Proposed sprint decision: in-memory only; persistence deferred to Sprint 002.

4. Streaming UX depth
- Proposed sprint decision: chunk append only; advanced streaming polish deferred.

## Suggested Task Breakdown (Issue-Level)
- Bootstrap Obsidian TypeScript plugin scaffold
- Define shared types and plugin settings schema
- Implement settings tab with agent status/toggles
- Implement desktop/mobile capability and agent detection
- Implement sidebar view and tabbed chat shell
- Implement agent runner process abstraction
- Implement tool-call parser and vault CRUD handler
- Integrate runner + UI + handler loop
- Execute manual QA checklist and bugfix pass
- Publish sprint notes and known limitations
