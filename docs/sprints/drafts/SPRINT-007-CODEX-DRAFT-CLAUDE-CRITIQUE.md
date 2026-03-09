# Sprint 007 Codex Draft Critique (by Claude)

## What Codex Gets Right

- Clean six-phase structure with explicit scope boundaries; easier to review than my draft's longer phase list
- Correctly identifies all the same core gaps (provider buildSystemPrompt, GeminiProvider message normalization, AgentChatTab deferred items, runner edge cases, file-op variants, runnerFactory base URL precedence)
- "Decision-mandatory" framing for Gemini E2E is genuinely useful — silent omission is worse than explicit defer
- Raises valid point that my `runnerFactory` precedence tests only verify runner type, not which URL was actually selected
- Raises valid point that `OpenAICompatProvider` empty-key path wasn't fully planned in my Phase 2 task list
- Correctly notes the layer-boundary confusion: "AgentRunner stderr updates the status element" conflates the runner emission with the UI rendering

## Gaps, Weaknesses, and Over-Engineering in Codex Draft

### 1. Contradicts the interview decision on Gemini
The user explicitly chose "Include it (P0)" for Gemini E2E with the GeminiProvider baseURL production change. Codex's Phase 6 treats Gemini as "implement if feasible" and explicitly states "do not require production transport changes." This conflicts with the user's stated intent. The GeminiProvider `baseURL` addition is a 2-line production change — the same pattern already exists in AnthropicProvider and OpenAIProvider — and is not "intrusive." This critique is **rejected**.

### 2. runnerFactory precedence test — raises the question but doesn't resolve it
Codex correctly identifies that "runner type" assertions don't prove which URL was selected, but Codex's own implementation tasks don't resolve this either: "constructor-arg capture/mocking or behavioral probe" is listed as a suggestion, not a concrete plan. My updated draft addresses this by documenting the observable behavioral proxy: settings-URL-invalid + env-URL-valid → debug log emitted + baseURL=undefined, which is verifiable through `vi.spyOn(console, "debug")` in debugMode.

### 3. Missing YOLO args passthrough
Codex's Phase 3 includes `extraArgs` but omits YOLO args. YOLO args are a distinct code path in `runnerFactory` (line 48: `const yoloArgs = agentConfig.yoloMode ? (adapter.yoloArgs ?? []) : []`) and should be tested separately. My draft included this; Codex dropped it.

### 4. No concrete OpenAICompatProvider empty-key test plan
Codex raises this as a gap in my draft (correctly) but doesn't add it to their own implementation plan either. Both drafts need this fixed in the merge.

### 5. Sprint format inconsistency
Codex's draft omits several sections required by the sprint template: Files Summary table, Definition of Done checklist, Security Considerations, Observability & Rollback, Documentation, Dependencies. These are required by `docs/sprints/README.md` and make the sprint actionable. This is a process gap, not a content gap, but it means Codex's draft cannot stand alone as the final sprint document.

## My Draft Choices I Would Defend

- **GeminiProvider baseURL P0**: Small, established pattern, user-confirmed. The "infeasibility" Codex cites stems from the current absence of baseURL support, which Phase 7a explicitly adds. Once added, the E2E pattern is identical to Anthropic/OpenAI.
- **All 4 providers tested fully (6 tests each)**: User confirmed this in the interview. Codex's approach is also "all four," so no conflict.
- **runnerFactory precedence via debug log spy**: Observable without mocking constructors. Codex raises the weakness without offering an implementable alternative; my approach provides one.
- **Phase tiering (P0/P1/Deferred)**: Required by sprint conventions; absent from Codex's draft structure.

## Synthesis for Merge

Accept from Codex:
- OpenAICompatProvider explicit empty-key constructor test (add to Phase 2 tasks)
- Clarify layer boundaries in use cases (AgentRunner emits stderr; AgentChatTab renders it — both are tested at their respective layers)
- "Explicit defer documentation" framing if Gemini E2E proves infeasible mid-sprint (even though we intend it as P0)

Reject from Codex:
- Remove GeminiProvider baseURL production change (user explicitly approved this)
- Treat Gemini E2E as infeasible/unknown (user chose P0 inclusion)
