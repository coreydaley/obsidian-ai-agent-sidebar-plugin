# Sprint 008 Security Review

## Scope

Sprint 008 introduces a new `tests/e2e-live/` directory with live tests, a new vitest config, npm script, Makefile target, and minor documentation updates. **No production source code is modified.** This review focuses on risks introduced by the test infrastructure itself.

## 1. Attack Surface

**New inputs and trust boundaries introduced:**

- `tests/e2e-live/helpers/liveHelpers.ts`: `isBinaryInstalled(cmd)` executes `execSync("which <cmd>")`. The `cmd` string is always a hardcoded constant in the callers (`"claude"`, `"codex"`, `"copilot"`) — not user-controlled. No injection risk.
- `buildFileCreatePrompt(filename)`: Constructs a prompt string with `filename` interpolated. The filename is hardcoded per describe block (e.g. `"live-e2e-cli-claude.md"`) — not user-controlled. No injection risk.
- `resolveApiKey(envVar)`: Reads `process.env[envVar]`. The env var name is a hardcoded string constant in callers. The returned value is passed to plugin settings at vault creation time; it never appears in test assertions. No exposure beyond the existing shell env trust model.

**Rating: Low**

## 2. Data Handling

**Sensitive data risks:**

- **API keys**: The live test suite does NOT embed API keys in `data.json`. Keys are resolved at plugin runtime from shell env. Keys are never printed, logged, or captured in assertions.
- **Screenshot artifacts**: `saveFailureScreenshot` saves `tests/e2e-live/artifacts/*.png`. These screenshots may contain:
  - Chat messages sent to live agents
  - Chat responses from live agents (which may echo the file-op prompt content)
  - Settings UI showing model names (not key values)

  Screenshots do not show API key values (keys are not displayed in the Obsidian UI). However, the content of agent responses is unpredictable.

  **Mitigation required**: Add `tests/e2e-live/artifacts/` to `.gitignore`. Already incorporated as a DoD item.

- **Temp vaults**: Created in `os.tmpdir()`, cleaned up in `afterAll`. Do not contain sensitive data (no real API keys written to disk). Low risk.

**Rating: Low** (artifact path addressed by DoD)

## 3. Injection and Parsing Risks

- `isBinaryInstalled` uses `execSync("which " + cmd)`. The `cmd` argument is only ever a hardcoded string in calling code. If a future caller passes a user-controlled value, this would be a command injection vector. Mitigation: add a comment in liveHelpers.ts noting that `cmd` must be a trusted constant, not user input.
- `buildFileCreatePrompt(filename)`: The filename is interpolated into a string passed as a chat prompt. Since filename is hardcoded, no injection. If filename were ever user-controlled, a malicious filename could confuse the :::file-op JSON parser. The JSON is explicitly constructed (not `JSON.stringify` + parse), so the risk is minor but worth noting.

**Rating: Low** (with documentation note in liveHelpers.ts)

## 4. Authentication/Authorization

This sprint does not introduce any new authentication or authorization checks. It consumes existing authentication mechanisms:
- CLI agents authenticate via their own shell session (not managed by this sprint)
- API agents authenticate via shell env vars read by the plugin's existing `shellEnv.ts`

No new auth flows are introduced. No auth bypass risks identified.

**Rating: Low**

## 5. Dependency Risks

No new npm packages are introduced. The new test files import only from:
- Existing project helpers (`tests/e2e/helpers/*`)
- Node.js built-ins (`fs`, `child_process`)
- Existing test dependencies (`playwright`, `vitest`)

**Rating: Low**

## 6. Threat Model

Given the project context in `CLAUDE.md` (an Obsidian plugin for developer use), the realistic adversarial scenario for sprint 008 is:

**Scenario**: A developer unknowingly runs `make test-e2e-live` with the test suite accessible in a shared environment (e.g., a CI server where env vars are set). The live tests call real external APIs and create files in temp vaults. If the `afterAll` cleanup fails (e.g., test runner process killed), temp vaults accumulate in `os.tmpdir()`. This is a resource leak, not a security issue. The temp vault paths are random and not predictable.

**Scenario 2**: Screenshot artifacts containing chat response content are accidentally committed. Mitigated by `.gitignore` DoD item.

**Scenario 3**: `isBinaryInstalled` is called with a path derived from an untrusted source in a future modification. The current implementation is safe; the documentation note in liveHelpers.ts prevents this.

**Rating: Low** — no realistic high-impact adversarial scenario.

## Findings Summary

| Finding | Rating | Mitigation | Status |
|---------|--------|------------|--------|
| Screenshot artifacts may contain chat content | Low | Add `tests/e2e-live/artifacts/` to `.gitignore` | In DoD ✓ |
| `isBinaryInstalled` cmd arg must be trusted | Low | Add comment in liveHelpers.ts | Add to Phase 2 tasks |
| `buildFileCreatePrompt` filename interpolation | Low | Filename is hardcoded; add comment noting constraint | Add to Phase 2 tasks |
| No API keys embedded in test files | N/A — good practice confirmed | N/A | N/A |

## Incorporating Critical/High Findings

No Critical or High findings. All findings are Low.

Two Low findings require small documentation additions:
1. Comment in `liveHelpers.ts` next to `isBinaryInstalled`: `// cmd must be a trusted constant — never pass user-controlled input`
2. Comment in `buildFileCreatePrompt`: `// filename is hardcoded per describe block; do not accept user-controlled filenames`

These do not change the sprint's implementation plan materially.
