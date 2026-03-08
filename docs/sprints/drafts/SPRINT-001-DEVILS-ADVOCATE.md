# Sprint 001 Devil's Advocate Review

This critique assumes the plan must be rejected unless risks are clearly bounded. The current draft does not clear that bar.

## 1) Flawed Assumptions

- The plan assumes all target CLIs can be driven through a single stdin/stdout conversational model, but these tools have materially different UX contracts (interactive TTY, subcommands, auth flows, non-streaming modes). A single adapter map is not evidence of runtime compatibility. [Ref: `Overview`; `Architecture` (`AgentRunner (child_process.spawn)`); `Phase 4: Agent Runner`; `Risks & Mitigations` (CLI invocation interface changes)]
- It assumes `which <cmd>` accurately implies the agent is usable. Detection only proves executable presence, not login state, model availability, required env vars, rate limits, or first-run prompts. “Installed” can still be non-functional. [Ref: `Agent Detection`; `Phase 3: Agent Detection`; `Verification Matrix` (binary installed => Installed)]
- It assumes agents will reliably emit `:::file-op` blocks with parseable JSON under streaming chunk boundaries. Real model output is probabilistic; delimiter fragmentation and malformed partial blocks are expected, not edge cases. [Ref: `Overview` (core design challenge); `Agent Communication Protocol`; `Phase 4` (stream block detector); `Story 4`]
- It assumes fallback to text-only is acceptable when protocol compliance fails, but core use cases 2-4 depend on CRUD. In practice this degrades primary value into “chat only” without guardrails on user expectation. [Ref: `Use Cases` (create/edit/delete/rename); `Agent Communication Protocol` (Fallback)]
- It assumes automatic active-file injection is always desirable and safe; that ignores sensitive-note leakage and token-window blowups on large files. The risk table mentions truncation, but truncation is not in the implementation tasks or DoD. [Ref: `Auto-Context Injection`; `Risks & Mitigations` (large file context blowup); `Story 5`; `Definition of Done`]
- It assumes “No API key storage” is sufficient security framing, while allowing arbitrary per-agent extra args that can alter runtime behavior in dangerous ways. [Ref: `Phase 2` (extra CLI args); `Security Considerations` (no API key storage)]

## 2) Scope Risks

- The sprint claims “complete plugin” while including multi-agent adapters, streaming parser, file tools, settings UX, tabbed chat UX, and process lifecycle management. That is multiple epics, not one sprint-sized vertical slice. [Ref: `Overview`; `Implementation Plan` (Phases 1-7)]
- Cross-platform support is under-scoped. The plan is desktop-only, not macOS/Linux-only, yet Windows behavior is a one-line fallback (`where`) with no path quoting, shell differences, or spawn semantics coverage. [Ref: `Overview` (desktop-only); `Phase 3` (Windows fallback with `where`)]
- “Dependencies: None” is false in practical terms. This depends on external CLIs, user auth state, PATH correctness, and per-agent protocol behavior. Treating these as non-dependencies hides schedule risk. [Ref: `Dependencies`; `Agent Detection`; `Phase 4`]
- File deletion confirmation is underspecified and likely to balloon. “Notice-based confirmation” is not a robust interaction primitive for destructive actions and may require modal/stateful flows after UX review. [Ref: `Phase 5` (delete confirmation); `Security Considerations` (destructive operations); `Post-Sprint Backlog` (full-modal delete confirmation)]
- Testing scope is aspirational without an automated harness (explicitly deferred). Manual matrix breadth is large and timing-sensitive (streaming, process exits, view lifecycle), which commonly slips late. [Ref: `Verification Matrix`; `Post-Sprint Backlog` (Automated test harness)]

## 3) Design Weaknesses

- The protocol design is brittle: overloading plain text streams with ad-hoc fences is easy to spoof, hard to parse incrementally, and fragile under tokenization artifacts. This is an unreliable control plane for file operations. [Ref: `Overview` (protocol challenge); `Agent Communication Protocol`; `Phase 4`]
- The architecture mixes UI concerns and orchestration complexity into one `ItemView` + per-tab state model without persistence boundaries. This invites memory growth and tangled lifecycle bugs as conversations accumulate. [Ref: `Overview` (tab architecture, in-memory state); `Architecture`; `Phase 6`]
- `sendMessage(text)` for “subsequent turns” is ambiguous with spawned CLI process lifetime: some CLIs are one-shot command invocations, not long-lived chat daemons. The architecture may force a state model unsupported by target executables. [Ref: `Phase 4` (`sendMessage`, process tracking); `Risks & Mitigations` (invocation interface changes)]
- Path-safety logic is naive. Rejecting literal `..`/absolute paths is insufficient without canonical resolution against vault root for all operations (including rename target and symlink edge cases). The plan’s wording implies string checks, not authoritative path resolution. [Ref: `Phase 5` (reject `..`/absolute); `Security Considerations` (normalize/validate)]
- “Content treated as trusted” is a major architectural concession that bypasses defense-in-depth; it assumes user intent equals safe output, which is exactly what prompt-influenced agents can violate. [Ref: `Security Considerations` (Content trust)]

## 4) Definition-of-Done Gaps

- DoD requires only one agent end-to-end (Claude Code). A “multi-agent plugin” can pass while Codex/Gemini/Copilot are broken. [Ref: `Definition of Done` (at least one CLI agent works); `Overview` (multi-agent promise)]
- No DoD item validates behavior under non-compliant agent output beyond malformed JSON text handling. Missing: partial delimiters across chunks, nested fences, repeated malformed ops, and mixed prose/tool output ordering. [Ref: `Agent Communication Protocol`; `Definition of Done`; `Verification Matrix`]
- No DoD item for auth/error taxonomy quality. “Readable error state” is vague; without concrete requirements, opaque subprocess failures can still pass. [Ref: `Story 2`; `Definition of Done`]
- No DoD coverage for concurrent operations or race conditions (rapid tab switching, parallel sends, unload during in-flight file op). [Ref: `Phase 6` (tab switching); `Phase 7` (dispose on unload); `Verification Matrix`]
- No DoD assertion that “extra CLI args” are validated/safe or that dangerous flags are constrained. [Ref: `Phase 2` (extra CLI arguments); `Security Considerations`]
- No DoD requirement for large-file handling despite risk acknowledging context blowups and proposed truncation. [Ref: `Risks & Mitigations` (8KB truncation); `Definition of Done`]

## 5) Most Likely Failure Mode

The sprint most likely fails as an integration death-by-a-thousand-cuts:

1. Detection marks CLIs as installed.
2. At runtime, one or more CLIs require interactive auth/TTY or emit non-conforming output.
3. `:::file-op` parsing fails intermittently under real streaming chunks.
4. CRUD reliability collapses into text-only fallback for substantial portions of sessions.
5. Team burns sprint time patching per-agent invocation quirks and parser edge cases, while UI and lifecycle defects pile up.

Result: a demo that appears to work on a narrow happy path (single machine, single agent, simple read/write) but is not shippable as a dependable multi-agent Obsidian plugin. [Ref: `Overview`; `Agent Detection`; `Agent Communication Protocol`; `Phase 4`; `Definition of Done` (single-agent acceptance); `Risks & Mitigations`]
