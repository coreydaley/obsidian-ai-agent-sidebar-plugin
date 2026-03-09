# Sprint 009 Security Review

## Scope

Review of `docs/sprints/SPRINT-009.md` for security risks introduced by the Docker-backed live E2E suite.

---

## 1. Attack Surface

**Finding:** New: `isPortInUse`, `startOllamaContainer`, `pullOllamaModel`, `warmUpOllamaInference`, `waitForOllamaReady`, `stopOllamaContainer` — all running in the test process on the developer's machine.

**Rating:** Low

No new plugin source code is modified. The attack surface is confined to the developer's local machine during test execution. The Ollama container is the only new network listener (`127.0.0.1:11434`).

**Mitigations already in plan:**
- Loopback-only bind (`-p 127.0.0.1:11434:11434`) — container API not accessible from the network
- Container is started and stopped within the test lifecycle

---

## 2. Data Handling

**Finding:** The `warmUpOllamaInference()` function sends a `POST /v1/chat/completions` request with the message content `"hi"` to the local Ollama container. No PII or sensitive data is involved.

**Rating:** Low

**Finding:** Failure screenshots and Docker logs are written to `tests/e2e-live/artifacts/`. These could contain LLM responses from the warm-up or test chat messages. The `tests/e2e-live/artifacts/` directory is already in `.gitignore` (Sprint 008 DoD).

**Rating:** Low — no secrets, no PII; LLM responses from `smollm2:135m` on synthetic inputs are not sensitive.

---

## 3. Injection and Parsing Risks

**Finding:** `dockerHelpers.ts` uses `execSync` with shell commands. All arguments (container name, port, model name, image name) are module-level constants.

**Risk assessed:** Command injection — could an attacker cause malicious values to reach `execSync`?

**Finding:** Constants are defined as string literals in the module:
```typescript
export const OLLAMA_CONTAINER_NAME = "obsidian-e2e-ollama";
export const OLLAMA_MODEL = "smollm2:135m";
```
There is no dynamic input, no environment variable substitution, no user-provided values feeding into `execSync`. The `startOllamaContainer` function constructs commands from these constants only.

**Rating:** Low

**Mitigations already in plan:**
- Plan already includes comment: `// All inputs to execSync are trusted constants — never pass user-controlled values`

**Recommendation:** Ensure `dockerHelpers.ts` does **not** expose any function that accepts an arbitrary string and passes it to `execSync`. Review the `isPortInUse(port: number)` implementation — this accepts a `number`, not a string, and uses Node's `net` module (not a shell command), so there is no injection risk.

---

## 4. Authentication / Authorization

**Finding:** `openaiCompatApiKey: ""` is passed to `createTestVault`. The `OpenAICompatProvider` substitutes `"ollama"` for empty keys. No real credentials are used in this test.

**Rating:** Low — no auth bypass; Ollama does not require authentication by default.

**Finding:** The test does not write any secrets to `data.json` or the vault. The API key field is explicitly empty.

**No action required.**

---

## 5. Dependency Risks

**New dependency: `ollama/ollama` Docker image**

- Ollama is an open-source project (MIT license) maintained by Ollama Inc.
- Docker image is pulled from Docker Hub (`ollama/ollama:latest`)
- Using `:latest` means the image version can change between runs
- Risk: a future `ollama/ollama:latest` version could have breaking API changes, security vulnerabilities, or different model-pull behavior

**Rating:** Medium

**Recommendation:** Pin the Docker image to a specific version tag (e.g., `ollama/ollama:0.6.5` or similar) rather than `latest`. This prevents uncontrolled updates and makes the test reproducible. Add the pinned version to `OLLAMA_IMAGE` constant in `dockerHelpers.ts`.

**Action:** Add `OLLAMA_IMAGE` constant and use it in `startOllamaContainer`, rather than hardcoding `ollama/ollama` inline. The version can be updated intentionally when needed.

**New model: `smollm2:135m`**

- Small language model from HuggingFace/SmolLM project
- Pulled from Ollama registry (ollama.com) during first test run
- Model weights are cached in Docker container layer cache
- Risk: model registry could be unavailable; model could be removed or changed

**Rating:** Low — model pull failure is explicitly handled by `pullOllamaModel` timeout; test would fail with a clear error

---

## 6. Threat Model

Project context: This is an Obsidian plugin. The test suite runs on a developer's local machine. There is no CI integration for this test (explicitly deferred). The threat model for this sprint is limited to developer machine security.

**Realistic adversarial scenario:**
A supply chain attack on the `ollama/ollama` Docker image could theoretically cause the test to spawn a malicious container. Mitigations: (1) Docker Hub image signing; (2) the container only binds to loopback; (3) pinning the image version reduces the attack window.

**Rating:** Low given loopback binding and local-only scope.

---

## Findings Summary

| # | Finding | Rating | Action |
|---|---------|--------|--------|
| 1 | `execSync` with constant inputs | Low | No action needed; verify no user input path |
| 2 | `ollama/ollama:latest` can drift | Medium | **Pin to specific version tag; add `OLLAMA_IMAGE` constant** |
| 3 | Artifacts contain LLM responses | Low | Already in `.gitignore` |
| 4 | No API key / no PII | Low | No action needed |
| 5 | `isPortInUse` uses `net` not shell | Low | No action needed |

---

## Actions Required Before Approval

**Medium finding — incorporate into DoD:**

- [ ] Add `OLLAMA_IMAGE` constant to `dockerHelpers.ts` (e.g., `"ollama/ollama:0.6.5"` or latest known-good version)
- [ ] Use `OLLAMA_IMAGE` in `docker run` command instead of bare `ollama/ollama`
- [ ] Add `OLLAMA_IMAGE` to the `dockerHelpers.ts` exports list in DoD
- [ ] Update plan text to reference pinned image; note it should be updated intentionally when Ollama is upgraded

No Critical or High findings. Sprint is approved from a security perspective after incorporating the pinned image version.
