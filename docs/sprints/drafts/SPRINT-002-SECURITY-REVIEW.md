# Sprint 002 Security Review

**Reviewer:** Claude (claude-sonnet-4-6)
**Plan:** `docs/sprints/SPRINT-002.md`
**Date:** 2026-03-07

---

## 1. Attack Surface

### New trust boundaries introduced

| Boundary | Description | Risk |
|----------|-------------|------|
| Provider API calls (Anthropic, OpenAI, Gemini) | Plugin makes outbound HTTPS calls to external provider endpoints with user API keys | Medium |
| Provider SDK dependencies (3 new packages) | SDK code executes in-process with full Obsidian/Electron privileges | Medium |
| Model list endpoint responses | External data parsed and used to populate UI dropdown | Low |
| Shell env resolution (shared utility) | Login-shell env vars are read at startup and cached | Low |

### New inputs accepted

- `settings.agents[id].selectedModel` — model ID string persisted in settings, passed to provider SDK calls
- Provider API responses (streaming text) — parsed by `:::file-op` parser (existing attack surface; no change)

---

## 2. Data Handling

### Finding: API key in resolved shell env cache — **Medium**

The shared `resolveShellEnv()` caches the full login-shell environment (including `OBSIDIAN_AI_AGENT_SIDEBAR_*` keys) in a module-level variable. This cache persists for the process lifetime. If any other plugin or Obsidian code can access this module's exports, it could read all cached env vars including API keys.

**Mitigation (add to DoD):**
- Mark `resolveShellEnvPromise` as not-exported (unexported/private)
- The cache is in-memory only and clears on Obsidian restart — acceptable
- The runner factory should extract only the specific key it needs, not pass the full env object to SDK constructors

**Rating: Medium**

### Finding: API key passed to SDK constructor — **Low**

API key is passed to `new Anthropic({ apiKey })`, `new OpenAI({ apiKey })`, `new GoogleGenerativeAI(apiKey)`. These objects may retain the key in their internal state. If a stack trace or unhandled exception surfaces the SDK object's properties, the key could leak to the console.

**Mitigation:**
- Already addressed: sanitise SDK exceptions in `AgentApiRunner` before emitting as `error` events
- Ensure `console.error` calls go through a sanitiser that scrubs known-format key values

**Rating: Low**

### Finding: `selectedModel` persisted in settings file — **Low**

Model ID strings like `claude-sonnet-4-6` are stored in plugin settings (Obsidian's `data.json`). This is not a secret. No sensitive data is persisted.

**Rating: Low (no action needed)**

---

## 3. Injection and Parsing Risks

### Finding: Model ID from dropdown used in SDK calls — **Low**

`settings.agents[id].selectedModel` is passed as the `model` parameter to SDK calls. If a user manually edits `data.json` to inject a malformed model string, it could potentially affect API request construction.

**Mitigation (add to Phase 6 tasks):**
- Validate `selectedModel` against the fetched model list (or a regex for model ID format) before passing to SDK
- Provider SDKs should safely handle invalid model IDs (returning an API error, not executing arbitrary code)

**Rating: Low**

### Finding: `:::file-op` parser reused for API text output — **Low**

The file-op parser is applied to streamed API text. An adversarial AI response that emits `:::file-op` blocks could trigger vault operations (read, write, delete). This is the same risk as the CLI path — it is an inherent design trade-off of the `:::file-op` protocol.

**Mitigation (existing, no change needed):**
- File write/delete requires user confirmation (existing `FileOperationsHandler` implementation)
- Canonical path validation and path traversal checks are already in place

**Rating: Low (accepted design trade-off)**

### Finding: Model list endpoint response parsing — **Low**

Model list responses from providers are parsed and used to populate a dropdown. A compromised CDN or MITM could inject unexpected model names.

**Mitigation:**
- HTTPS only (provider SDKs enforce this)
- Model names are displayed as-is in UI — no eval or HTML injection risk (Obsidian's `createEl` escapes text content)

**Rating: Low**

---

## 4. Authentication and Authorization

### Finding: No key validation at enable time — **Medium**

The enable toggle becomes active when a key is "detected" (present in env), not when it is validated. A user with a revoked or wrong-scope key can enable API mode, which will fail on first use.

**Mitigation (already in DoD):**
- Settings badge tooltip clarifies: "Key detected. Validity confirmed on first use."
- API auth failures (401/403) display a clear error in chat with guidance ("Check your API key")
- No additional action needed; this is an acceptable UX trade-off

**Rating: Medium — mitigated by clear error messaging**

### Finding: No mechanism to rotate or clear a detected key — **Low**

The plugin reads the key from the environment but cannot instruct the user to update or clear it. If a key is compromised, the user must update their shell profile and restart Obsidian.

**Mitigation:**
- Document in settings UI: "To update your key, update your shell profile and re-scan."
- No in-plugin key management is needed (reduces attack surface)

**Rating: Low**

---

## 5. Dependency Risks

### Finding: Three new heavyweight SDK packages — **Medium**

Adding `@anthropic-ai/sdk`, `openai`, `@google/generative-ai` introduces supply-chain risk. These packages execute at runtime with Obsidian/Electron's full system privileges.

**Mitigations:**
- All three are published by the official providers (Anthropic, OpenAI, Google)
- Pin specific versions in `package.json`; do not use wildcard ranges
- Review changelogs before upgrading

**Add to Phase 6 DoD:**
- [ ] SDK packages pinned to specific versions (not `^` or `~`)

**Rating: Medium — acceptable given official provenance, mitigated by pinning**

### Finding: SDK dependencies may include transitive packages with broader risk — **Low**

Transitive dependencies are not audited in this plan.

**Mitigation:**
- Run `npm audit` after install; address any high/critical findings
- Add to Phase 6 tasks: `npm audit` passing at high severity threshold

**Rating: Low**

---

## 6. Threat Model

**Context:** This is a desktop Obsidian plugin running in Electron, distributed to personal users. Threat actors are primarily:
- **Malicious vault content**: A note could craft content that triggers file-op injection via AI responses (same risk as CLI; mitigated by existing confirmation UI)
- **Compromised provider SDK**: A compromised `@anthropic-ai/sdk` (or transitive dep) could exfiltrate API keys or vault content. Mitigated by using official packages with pinned versions.
- **Log file exfiltration**: Obsidian debug logs or the plugin's debug mode could expose API keys. Mitigated by `[REDACTED]` masking.
- **Settings file exposure**: `data.json` is stored in the vault. If the vault is shared (e.g., synced to a public repo), settings are exposed — but no API keys are stored there, so this is safe.

**Most realistic adversarial scenario for this sprint:**
A user accidentally includes their vault in a public repository. The `data.json` file is exposed. Since this sprint explicitly prohibits storing API keys in settings, no credentials are exposed. `selectedModel` and `accessMode` are benign. Risk is low.

---

## Security Findings Summary

| Finding | Rating | Action |
|---------|--------|--------|
| Shell env cache contains API keys | Medium | Already private/unexported; extract only specific key for SDK, not full env |
| API key in SDK object (exception leak risk) | Low | Already addressed in DoD (exception sanitisation) |
| Model ID not validated before API call | Low | Add validation in Phase 6 tasks |
| Three new SDK packages (supply chain) | Medium | Pin to specific versions; run `npm audit` |
| No key validation at enable time | Medium | Already mitigated by clear error messaging in DoD |
| Transitive dependency audit | Low | Add `npm audit` to Phase 6 tasks |

---

## Critical/High Findings Incorporated into Sprint

*No Critical findings. Medium findings:*

1. **SDK version pinning** → Added to Phase 6 tasks
2. **`npm audit` requirement** → Added to Phase 6 tasks
3. **Shell env cache: extract only specific key** → Added to Phase 5 (runner factory) tasks
4. **Model ID validation** → Added to Phase 6 tasks

All other findings are Low or already mitigated by existing DoD items.
