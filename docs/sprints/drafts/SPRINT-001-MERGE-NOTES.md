# Sprint 001 Merge Notes

## Claude Draft Strengths
- Detailed ASCII architecture diagram showing data flow
- Strong risk table with likelihood/impact/mitigation
- Clear phase-based implementation plan with file-by-file breakdown
- Good security considerations section
- Agent communication protocol clearly explained with examples

## Codex Draft Strengths
- Explicit "Out of Scope" section (critical for scope control)
- Separate `AgentChatTab.ts` file for cleaner UI separation
- User stories with acceptance criteria (better for verification)
- More explicit verification matrix including error paths
- `rename` operation included in file ops
- `README.md` added as a deliverable
- Clearer "Open Decisions" section for pre-build alignment
- Better separation of plugin/UI/agent/file-safety layers in architecture

## Valid Critiques Accepted

1. **Add explicit "Out of Scope" section** — adopted from Codex draft to protect scope
2. **Add explicit user stories with acceptance criteria** — adopted from Codex for clearer verification
3. **Separate `AgentChatTab.ts`** — Codex correctly identified this as a distinct component
4. **Add `rename` to supported file operations** — Codex draft included this; my draft omitted it
5. **Tighten path safety specification** — add explicit "reject path traversal before dispatch" requirement
6. **Clarify persistence policy** — state clearly: in-memory conversations only in v1, settings persist
7. **Define fallback for unsupported agents** — define UX when enabled agent is not installed
8. **Add `README.md` as deliverable**
9. **Add detailed error-path verification** — Codex's manual matrix was more thorough

## Critiques Rejected (with reasoning)

1. **"Replace delimiter protocol with newline-delimited JSON envelopes"** — The user explicitly chose structured markers (`:::file-op`) in the interview. We honor that choice. However, we add a text-only fallback for when agents don't comply, which addresses the robustness concern.

2. **"Mark Copilot as detection-only in Sprint 001"** — The user explicitly noted that `copilot` is the correct CLI command (not `gh copilot`), implying they want it included. We'll include it with the caveat that it may need its own adapter, and fall back to text-only mode if it can't produce structured file-op blocks.

3. **"Move streaming to post-sprint backlog"** — The user explicitly chose real-time streaming in the interview. This stays as a required feature, not a stretch goal.

4. **"Move delete confirmation modals to post-sprint backlog"** — This is a valid safety feature worth keeping. However, we'll simplify it to an Obsidian `Notice` + confirm pattern rather than a full modal.

## Interview Refinements Applied

- **Protocol**: `:::file-op` JSON fence markers (user's explicit choice)
- **Settings**: All four config options included (enable/disable, model selection, extra CLI args, persistence toggle)
- **Platform**: Desktop only (explicit in manifest)
- **Streaming**: Real-time token-by-token (user's explicit choice)
- **Auto-context**: Current open file auto-injected into system prompt
- **Copilot**: CLI command is `copilot` (not `gh copilot`), included in v1

## Final Decisions

- Primary protocol: `:::file-op` fenced JSON blocks (user-chosen); text-only fallback for non-compliant output
- Conversation state: in-memory only for v1; persistence toggle in settings deferred to Sprint 002 implementation
- Mobile: explicitly desktop-only in `manifest.json` (`isDesktopOnly: true`)
- Streaming: chunk-by-chunk token append (required, not stretch)
- Delete confirmation: Obsidian `Notice` with confirm (not a full modal, but still safe)
- `AgentChatTab.ts` added as a separate component from `AgentSidebarView.ts`
- `rename` added to supported file operations
