# Sprint 006 Merge Notes

## Claude Draft Strengths
- Correct overall architecture: JSDOM + Obsidian DOM polyfill + EventEmitter runner stubs
- `tests/unit/` directory naming consistent with project conventions
- Makefile target for completeness of `make test-all`
- Destroy/recreate lifecycle test (confirmed by user in interview)
- P0/P1 tiering correctly prioritizes streaming event handling over context payload tests

## Claude Draft Weaknesses (from Codex critique)
- **Critical**: event-flow tests must trigger send first — `token`/`complete`/`error` have no effect without an active streaming message (`currentAssistantMsgEl` is null without `sendMessageContent()` running)
- `stderr` event coverage missing
- Proposed a new `mockObsidianModule.ts` when existing `obsidianStub.ts` can be reused

## Codex Draft Strengths
- Parametrized fake runner with `kind: "cli" | "api"` label is a readable pattern for documenting equivalence
- Settings-level API key in mode-switching tests avoids shell env cache dependency
- Context payload test promotion is a valid concern (accepted as P1)
- `FakeExecutionRunner` records `run()` calls — useful for verifying send flow triggers runner correctly
- Alias reuse from integration stub

## Codex Draft Weaknesses (from Claude critique)
- Uses `tests/chat/` directory — inconsistent with project's layer-based naming
- Omits Makefile target — breaks project convention and `make test-all`
- Defers destroy/recreate lifecycle test — user explicitly confirmed this as P0
- Parametrized tests over-engineered — both stubs are identical; explicit equivalence tests are cleaner

## Valid Critiques Accepted
- **From Codex on Claude draft**: Tests must trigger send before emitting events → ALL event-flow tests now use `triggerSend(tab, container)` helper (clicks send button after typing) before emitting events. This is the most important correction.
- **From Codex on Claude draft**: Add `stderr` event test → added to P0
- **From Codex on Claude draft**: Reuse `obsidianStub.ts` alias → removed separate `mockObsidianModule.ts` phase; use alias in vitest config

## Critiques Rejected
- **Codex: `tests/chat/` directory** → Use `tests/unit/` for layer-based naming consistency
- **Codex: Makefile optional** → Keep as P0; required for `make test-all` completeness
- **Codex: context tests in P0** → P1; low risk path
- **Codex: defer lifecycle test** → User confirmed as P0

## Interview Refinements Applied
- Separate `vitest.unit.config.ts` (not folded into existing unit config)
- Destroy/recreate lifecycle test added (user confirmed)
- EventEmitter stubs only — no real fakeAgent scripts in chat tab tests

## Final Decisions
1. New `vitest.unit.config.ts` with JSDOM, `include: tests/unit/**/*.unit.test.ts`, alias to `obsidianStub.ts`
2. `tests/unit/helpers/obsidianDomPolyfill.ts` — polyfills createEl, createDiv, createSpan, addClass, removeClass, empty
3. `tests/unit/agent-chat-tab.unit.test.ts` — all event tests use `triggerSend()` first
4. Mode-switching tests use settings-level `apiKey` to avoid env cache; add four test sequences
5. Destroy/recreate lifecycle test in P0
6. `npm run test-unit` + `make test-unit` + add to `make test-all`
