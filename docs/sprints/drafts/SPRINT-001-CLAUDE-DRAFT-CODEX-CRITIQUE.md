# Sprint 001 Claude Draft Critique (by Codex)

## Summary
Claude's draft is strong on structure, coverage, and clarity for a greenfield sprint. It defines architecture, milestones, risks, and a viable MVP path. The main issues are scope pressure, a few assumptions that may be brittle for Sprint 001, and several implementation details that should be reframed as optional to reduce delivery risk.

## What Claude Draft Does Well
- Clear end-to-end framing from plugin lifecycle to UI, runner, and vault operations.
- Good identification of the core hard problem: agent protocol for structured CRUD.
- Strong milestone decomposition that maps well to implementation order.
- Sensible risk table, including parser fragility and mobile constraints.
- Includes concrete definition of done and operational acceptance checks.

## Critical Gaps and Risks

1. Protocol format is too agent-behavior-dependent for Sprint 001.
- `:::file-op` delimiter blocks assume model compliance with custom formatting.
- This increases failure rates and parser complexity for the first sprint.
- Recommendation: define a strict JSON-line envelope first, with text-only fallback when parsing fails.

2. Copilot assumption is under-specified and likely inconsistent with chat-loop design.
- `gh copilot` command model differs from long-running conversational CLIs.
- Treating it as equivalent to Claude/Codex/Gemini risks integration churn.
- Recommendation: mark Copilot as detection-only in Sprint 001 unless adapter viability is proven early.

3. Scope includes several features that are better deferred.
- Streaming token rendering, delete confirmation modal, version probing, and system-prompt wrapping all in Sprint 001 may dilute focus.
- Recommendation: prioritize stable request/response loop, safe CRUD, and settings persistence first; treat advanced UX as stretch goals.

## Medium Priority Improvements

1. Add explicit non-goals section.
- This is needed to protect Sprint 001 from feature creep.

2. Tighten file safety specification.
- Draft mentions path validation but should explicitly require normalized vault-bound checks and reject traversal patterns before any action dispatch.

3. Clarify cross-platform process strategy.
- Detection mentions `which/where`, but spawn path/argument quoting behavior should be captured as an explicit risk/implementation note.

4. Define fallback behavior for unsupported agents.
- Specify expected UX when an agent is enabled but not installed, or installed but not protocol-capable.

5. Clarify persistence policy.
- Draft implies in-memory tab state but settings include persistence toggle.
- For Sprint 001, state a single default policy (in-memory conversations; persistent settings only).

## Suggested Edits to Claude Draft
1. Replace delimiter protocol with newline-delimited JSON envelope as primary contract.
2. Re-scope Copilot to optional adapter milestone or explicitly "text-only/unsupported" for Sprint 001.
3. Move streaming polish, confirmation modals, and per-agent prompt customization into a "post-sprint backlog" section.
4. Add explicit "Out of Scope" section and "Open Decisions Required Before Build" section.
5. Add acceptance criteria that include malformed tool-call recovery and guaranteed no-crash mobile behavior.

## Verdict
Claude's draft is a good foundation and is close to executable. With protocol hardening, tighter scope boundaries, and clearer fallback definitions, it becomes a lower-risk Sprint 001 plan for a first implementation cycle.
