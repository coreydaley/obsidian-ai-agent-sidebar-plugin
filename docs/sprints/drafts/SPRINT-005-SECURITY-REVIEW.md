# Sprint 005 Security Review

## Scope
Security audit of `docs/sprints/SPRINT-005.md`: API endpoint env var overrides + chat E2E tests.

---

## 1. Attack Surface

**New inputs and trust boundaries:**

| Input | Source | Trust Level | Where Used |
|-------|--------|-------------|------------|
| `OBSIDIAN_AI_AGENT_SIDEBAR_*_BASE_URL` | Shell environment | User-controlled | `runnerFactory.createRunner()` → passed to SDK constructors |
| Mock server port | E2E test process (loopback) | Trusted (test-only) | Env var injected via `electron.launch` env |
| `extraEnv` harness param | E2E test code | Trusted (test-only) | Merged into Obsidian process env |

**Assessment**: The env var base URL override follows the same trust model as the existing `apiKeyEnvVar` mechanism. It is read from the user's shell environment, which is already under user control. No new external inputs are introduced in production code.

**Rating**: **Low**

---

## 2. Data Handling

**Sensitive data considerations:**

- **Base URL values are not secrets**: Unlike API keys, URL overrides do not carry authentication credentials. They tell the SDK where to connect, not how to authenticate.
- **Base URL is logged in debugMode**: The `runnerFactory` will log the presence of an invalid base URL in debug mode. Since the URL is not a secret, this is safe. The implementation must NOT log the API key alongside the URL.
- **Mock server handles fake API keys**: The mock server receives API key headers (`x-api-key: fake-key`, `Authorization: Bearer fake-key`). These are test-only placeholder strings and are never stored, logged, or forwarded.
- **E2E test env vars**: The `extraEnv` dict merges test-specific env vars into the Obsidian process env. The sprint document correctly specifies merge order `{ ...process.env, ...extraEnv }`. This means test fake API keys temporarily override any real API keys of the same name in the parent process's env. **This could expose real API keys via the real provider endpoint if the mock server is not running when the test starts.** The DoD requires mock server is started before Obsidian launch, which mitigates this.

**Mitigation needed**: Add to DoD: "Mock server must be confirmed listening before `launchObsidian` is called in `beforeAll`."

**Rating**: **Low** (with the above DoD addition)

---

## 3. Injection and Parsing Risks

**URL injection:**
- `isValidBaseUrl` validates that the env var is a well-formed URL with `http:` or `https:` protocol before it is passed to SDK constructors. This prevents SSRF escalation via protocol smuggling (e.g., `file://`, `javascript:`, `ftp://`).
- `URL` constructor parsing is used for validation — this is safe; the parsed URL object is used only for protocol check, not reconstructed into a string that could be manipulated.
- **Concern**: The `baseURL` value is passed directly to third-party SDK constructors (`new Anthropic({ baseURL })`, `new OpenAI({ baseURL })`). These SDKs concatenate the base URL with API paths (e.g., `/v1/messages`). A `baseURL` with a trailing path component (e.g., `http://proxy.example.com/prefix`) will behave differently across SDKs — Anthropic SDK appends the path, OpenAI SDK may normalize it. **Mitigation**: Document this behavior in JSDoc; do not strip trailing slashes or paths (let each SDK handle it per its own behavior). This is not a security issue but a UX/correctness concern.

**Mock server parsing:**
- The mock server parses `req.url` to dispatch routes. URL parsing uses string comparison, not `URL` constructor — safe for this simple routing use case.
- The mock server reads and discards request bodies; no user data is processed or reflected.
- **No injection surface**: Mock server does not execute code based on request content; responses are canned strings.

**Rating**: **Low**

---

## 4. Authentication and Authorization

**How does the URL override interact with auth?**

- Base URL override only changes WHERE requests go, not HOW they are authenticated. API key headers are still sent to the overridden endpoint.
- **Risk**: If a developer accidentally sets `OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL` to a third-party proxy endpoint (not their own), API keys would be forwarded to that proxy. This is the user's own env var, so it is within the user's control — same as any proxy configuration. The plugin should not be held responsible for user misconfiguration of their own env.
- **No regression to existing auth**: CLI mode, openai-compat (settings-based URL), and providers without `apiBaseUrlEnvVar` set are unaffected.

**Rating**: **Low**

---

## 5. Dependency Risks

**No new npm dependencies in this sprint.** Mock server uses Node.js built-in `http` module.

**SDK behavior audit:**
- `@anthropic-ai/sdk`: `baseURL` constructor option is documented and used in official SDK testing infrastructure. No known security issues with this option.
- `openai`: `baseURL` constructor option is documented. Same assessment.
- `@google/generative-ai`: `requestOptions.baseUrl` is typed but less documented. Risk is behavioral (P1), not security.

**Rating**: **Low**

---

## 6. Threat Model

**Given the project context (Obsidian plugin for desktop AI interaction), realistic adversarial scenarios:**

1. **SSRF via env var**: An attacker who can set env vars in the user's shell could redirect API calls to an internal network endpoint. However, an attacker with shell env write access already has full local access and doesn't need this vector. Mitigated by `http/https` protocol enforcement.

2. **Credential forwarding via malicious proxy**: User sets base URL to a URL they don't control (accidental or social engineering). Plugin forwards API keys to that URL. Mitigation: user education (JSDoc on `apiBaseUrlEnvVar`). Not a plugin vulnerability — it's a user configuration issue.

3. **Mock server exposure**: E2E tests bind a server on loopback (`127.0.0.1`). Other local processes could connect to it, but: (a) they'd receive only canned test responses, and (b) the server is ephemeral (started in `beforeAll`, stopped in `afterAll`). No persistent exposure.

4. **Test fake keys leaking to real endpoints**: If mock server is not running when a test sends a message, the SDK uses the real provider endpoint. Fake keys are rejected (401). No real credentials are sent. Mitigated by mock server start-before-launch ordering requirement.

**Rating**: **Low** (all identified threats are low-severity or already mitigated)

---

## Findings Summary

| Finding | Severity | Section | Action |
|---------|----------|---------|--------|
| Mock server must be confirmed listening before Obsidian launch | Low | Data Handling | Add DoD item |
| Debug log for invalid URL must not include API key | Low | Data Handling | Implementation note (not sprint doc change) |
| URL with trailing path may behave differently per SDK | Low (correctness) | Injection | Document in JSDoc; no security action needed |

---

## Incorporating Findings into Sprint Document

The only finding requiring a sprint document change:

- **DoD addition**: "Mock server is confirmed listening (server start awaited) before `launchObsidian()` is called in `beforeAll`"

All other findings are implementation notes that the implementer should keep in mind.
