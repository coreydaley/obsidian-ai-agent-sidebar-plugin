# SPRINT-002 Devil's Advocate Review

This plan should not be approved as-is. It is optimistic in the wrong places, under-specified where failure modes live, and likely to produce a superficially working but operationally brittle implementation.

## 1) Flawed Assumptions

1. **Assumes API key presence means API access is usable.**
The plan treats `hasApiKey` as capability truth (`Detection Model`, `Phase 3`, `Definition of Done`: “enabled && (isInstalled || hasApiKey)”). That ignores revoked keys, wrong project/org scopes, exhausted quotas, region restrictions, and model-level permissions. Result: UI claims “available” while first request fails.

2. **Assumes one env var per provider is sufficient for auth.**
`Provider Capability Registry` only models `apiKeyEnvVar`. Real providers frequently require additional config (organization/project IDs, base URL for gateways/proxies, enterprise routing). This assumption will break for non-default setups and enterprise users.

3. **Assumes official SDK streaming shapes are stable and equivalent.**
`Phase 6` says one `AgentApiRunner` emits the same event contract as CLI for Anthropic/OpenAI/Gemini. Provider streaming semantics differ materially (event types, partial deltas, finish reasons, tool/function output payloads). “Same interface” is easy to declare and hard to preserve under edge cases.

4. **Assumes history mapping is straightforward across providers.**
`Phase 6` hand-waves message conversion (“build message array”, “map to Gemini Content[]”). Role semantics differ across APIs (system placement, assistant turn constraints, multimodal blocks, tool roles). This is a classic silent-behavior-regression risk.

5. **Assumes model listing APIs are fit for settings-time UI fetches.**
`Phase 7` requires live model fetch on dropdown render/re-scan. That assumes low latency, reliable connectivity, and permissive rate limits at settings time. In practice this introduces UI stalls and flaky “works on my network” behavior.

6. **Assumes hardcoded default models are stable enough as fallback.**
`Phase 2` hardcodes defaults (`claude-sonnet-4-6`, `gpt-4o`, `gemini-2.0-flash`). Model IDs deprecate, alias, or change entitlement visibility. Fallback can become invalid and fail instantly.

7. **Assumes dropping Gemini CLI is low-risk.**
Overview says “Gemini CLI is dropped (unreliable)” but provides no migration or compatibility analysis for users currently depending on it. This is a behavior removal disguised as cleanup.

## 2) Scope Risks

1. **This is not one sprint; it is three cross-cutting projects bundled together.**
UI architecture rewrite (`Phase 4`), runtime transport abstraction (`Phase 5/6`), and remote model-discovery logic (`Phase 7`) all in one sprint. Any one can absorb the whole timeline.

2. **Provider API integration complexity is badly underestimated at 25%.**
`Phase 6 (~25%)` is fantasy sizing. You’re integrating 3 SDKs, 3 stream protocols, role conversion, error normalization, and file-op parsing parity. This is where most regressions and bug-fixing time will concentrate.

3. **Model fetch adds hidden dependency surface and compliance risk.**
`Phase 7` introduces network calls from settings UI with provider-specific filtering logic. Hidden scope: retries, timeouts, cancellation, auth failures, partial responses, response caching, and future API version drift.

4. **Detection and gating are now coupled to shell/env resolution correctness.**
`Phase 1/3` extracts shared `resolveShellEnv()`. Any bug in shell env resolution now corrupts both CLI detection and API key detection across all providers.

5. **Conversation reset on mode switch can trigger UX churn and support burden.**
`Phase 7` mandates clearing chat on mode switches. Without explicit confirmation/restore behavior, users lose context and blame the plugin. This creates product/support scope that is not planned.

6. **Dependency footprint expansion is unaccounted for operationally.**
`Phase 6` adds three heavyweight SDK deps. Missing scope: bundle size impact, plugin startup/load implications, lockfile churn, and compatibility testing in Obsidian’s runtime environment.

## 3) Design Weaknesses

1. **Provider abstraction is too rigid and leaks implementation assumptions.**
`ProviderConfig` bakes in `listModelsEndpoint` and singular `apiKeyEnvVar`, which is a brittle lowest-common-denominator abstraction. It looks clean now but will fracture when providers need additional auth/config knobs.

2. **Single `AgentApiRunner` for all providers risks a “god class.”**
`Phase 6` centralizes three providers in one class with branching dispatch. This tends to accumulate provider-specific exceptions and conditionals until it becomes untestable and fragile.

3. **Event contract parity is specified, not proven.**
`Runner Interface` claims same events as CLI path, including file-op lifecycle. But API responses are semantically different and may not preserve token boundaries/file-op marker integrity. Design currently depends on optimistic parsing.

4. **`:::file-op` over plain text is a protocol smell for API mode.**
`Phase 6` reuses text parser from CLI. Text-stream protocol markers are fragile under model formatting variance, markdown fences, or provider content normalization. This is especially weak in multi-provider API mode.

5. **Factory decision logic relies on mutable detection snapshots.**
`Phase 5` routes by `accessMode` + detection results. If detection is stale between settings render and run initiation, runtime can pick invalid mode and fail late. No explicit freshness/validation boundary is defined.

6. **Settings view owns too much orchestration responsibility.**
`Phase 4 + 7` asks settings UI to render, gate, auto-correct modes, and do live model fetching. UI layer becomes business-logic heavy and harder to reason about/test.

## 4) Gaps in Definition of Done

1. **No requirement for automated tests.**
DoD ends at “TypeScript compiles.” No unit/integration/e2e criteria for detection, gating, mode switching, stream handling, or migration. This allows fragile behavior to ship.

2. **No explicit timeout/retry/cancellation criteria for API operations.**
DoD requires streaming tokens but says nothing about stuck streams, provider timeouts, aborted requests, or backoff behavior.

3. **No negative-case acceptance criteria for auth failures.**
No DoD item verifies user-facing behavior for invalid/revoked keys, quota errors, model-not-entitled errors, or 429 handling.

4. **No telemetry/logging quality bar beyond key redaction.**
DoD checks “never log API keys,” but lacks observability requirements for diagnosing failures (provider, model, mode, error class) safely.

5. **No performance criteria for settings rendering or model fetch.**
DoD requires live model fetch but no threshold for UI responsiveness, loading indicators, caching, or avoiding repeated calls.

6. **No compatibility criteria for existing conversations/settings semantics.**
Only migration load is mentioned. Missing: backward behavior checks for existing enabled agents, preserved UX for CLI users, and deterministic defaults when new fields are absent/corrupt.

7. **No security hardening criteria beyond persistence/logging.**
DoD ignores secret lifetime in memory, accidental exposure via thrown SDK errors, and transport configuration (e.g., proxy/base URL trust boundaries).

8. **No explicit validation that model dropdown options are actually runnable.**
DoD says “populated by live provider API fetch” but not “selected model can successfully complete a test prompt.” A dropdown of unusable models still passes.

## 5) Most Likely Failure Mode

**The sprint “passes” DoD while users hit first-message runtime failures in API mode.**

Why this is the highest-probability failure:
1. Capability gating is based on `hasApiKey` presence, not validated entitlement (`Detection Model`, `Phase 3`, `DoD` gating rules).
2. Model dropdown success is defined as list population, not execution viability (`Phase 7`, `DoD`).
3. Transport parity is asserted by interface, not hardened by failure-path tests (`Runner Interface`, `Phase 6`, missing test DoD).

Expected symptom pattern:
1. Settings shows provider “available,” enable toggle works, model appears selectable.
2. User starts chat in API mode.
3. First request fails with auth/entitlement/format/provider-stream mismatch.
4. Team spends post-sprint time firefighting “it was enabled but didn’t work” reports.

## Approval Verdict

**Reject for implementation readiness.**
The plan currently optimizes for visible completeness (UI + dropdown + compile) over operational correctness. Without stronger validation criteria, decomposition, and failure-path acceptance, this sprint is likely to ship a polished false-positive experience.
