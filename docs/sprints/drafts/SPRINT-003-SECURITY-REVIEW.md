# Sprint 003 Security Review

## Scope

Security audit of `docs/sprints/SPRINT-003.md` — Integration Test Suite.

This sprint adds test infrastructure only (no new production features). The security surface is therefore narrow: the tests themselves and the one production code change (`AgentApiRunner` optional `provider` parameter). Threat model focuses on: (1) test infrastructure introducing new attack vectors, (2) the DI seam weakening existing security properties, and (3) test data/fixtures creating sensitive exposures.

---

## Findings

### Finding 1 — Fake agent scripts written to `os.tmpdir()` with predictable naming
**Rating: Low**

**Section:** Phase 1, `fakeAgent.ts`

The plan creates temporary `.mjs` scripts in `os.tmpdir()`. If the script file name is predictable (e.g., `fake-agent-1234.mjs`) and the temp directory is world-writable (it is on all platforms), an adversary with local access could replace the script between creation and execution (TOCTOU race).

In a developer test environment this risk is negligible. However, since the script is executed by `process.execPath` (Node), a replaced script could run arbitrary code with the test process's privileges.

**Mitigation (incorporated into DoD):** Use `fs.mkdtemp()` (or `crypto.randomUUID()`) to create a uniquely-named directory per test run, then write the script into it. Set the file mode to `0o700` (owner-execute only) immediately after creation. The existing DoD's `afterEach` cleanup handles deletion.

---

### Finding 2 — Fake agent script writes are not sanitized against the chunk content
**Rating: Low**

**Section:** Phase 1, `fakeAgent.ts`; Phase 3, AgentRunner tests

`writeFakeScript(tmpDir, chunks)` embeds the chunk strings into a generated `.mjs` file. If a test passes chunk content containing JavaScript template literal injection or escape sequences (e.g., `` `${process.exit(1)}` ``), the generated script could behave unexpectedly.

In practice, tests define their own chunks so this is a developer-only surface, but the plan doesn't address safe stringification.

**Mitigation (incorporated into DoD):** The `writeFakeScript` implementation must use `JSON.stringify(chunks)` when embedding the array into the script body (not template literal interpolation). This ensures chunk content is always safely escaped.

---

### Finding 3 — `vi.mock('obsidian')` stub could shadow real security behavior in unexpected ways
**Rating: Low**

**Section:** `Obsidian mock strategy`, Phase 1 `mockObsidian.ts`

The `vi.mock('obsidian')` setup file applies globally to the integration suite. If any integration test inadvertently imports a module that also uses the obsidian mock, the stub's simplified `normalizePath` (backslash normalization only) could mask path validation bugs that only appear with real Obsidian normalization.

The path traversal tests in particular rely on `normalizePath` being correct. If the stub diverges from reality, a traversal that is blocked in tests might pass in production.

**Mitigation (incorporated into DoD):** Path traversal tests must assert invariant outcomes (no file written outside vault root, verified via real `fs.existsSync` on the resolved path) rather than relying solely on error message strings. This is already addressed in the post-devil's-advocate patch. Additionally: add a comment in `mockObsidian.ts` listing the known differences from real Obsidian and what behaviors this makes untestable.

---

### Finding 4 — `AgentApiRunner` optional `provider` DI seam: no production guard
**Rating: Low**

**Section:** `AgentApiRunner testability seam`

The new optional `provider?: ProviderAdapter` constructor parameter is intended for test use only. However, nothing in production code prevents a future caller from passing an untrusted or malicious `ProviderAdapter` implementation in production. A rogue `ProviderAdapter` could stream arbitrary content (including `:::file-op` blocks) that the runner would execute against the vault.

**Assessment:** This is a theoretical risk. In practice, `AgentApiRunner` is only instantiated from `runnerFactory.ts`, which constructs the provider internally using known SDK implementations. The DI seam doesn't weaken production behavior.

**Mitigation:** Add a JSDoc comment on the parameter: `/** For testing only — not validated in production; do not expose to external callers. */`. No code change needed. This is incorporated as a documentation requirement.

---

### Finding 5 — Shell env fallback test mutates `process.env.SHELL`
**Rating: Low**

**Section:** Phase 7, `shell-env.integration.test.ts`

The shellEnv test proposes temporarily setting `process.env.SHELL` to a nonexistent path to trigger the fallback. If this mutation leaks between tests (e.g., due to a test crash), subsequent tests relying on correct shell resolution could behave unexpectedly.

**Mitigation (incorporated into DoD):** The shellEnv test must save `process.env.SHELL` before mutation and restore it in a `finally` block (or use vitest's `afterEach` + `vi.stubEnv()`). `vi.stubEnv()` is the preferred vitest API — it automatically restores stubbed env vars after each test.

---

## Attack Surface Summary

| Area | New? | Risk |
|------|------|------|
| Fake agent `.mjs` scripts in temp dir | Yes | Low — TOCTOU if predictable naming; mitigated by mkdtemp |
| vi.mock('obsidian') stub normalization divergence | Yes | Low — path traversal invariant tests mitigate |
| AgentApiRunner DI seam | Yes | Low — production callsite uses known providers only |
| `process.env.SHELL` mutation in tests | Yes | Low — mitigated by vi.stubEnv() |
| No new network-facing surfaces | N/A | None |
| No new storage or persistence | N/A | None |
| No new user input handling | N/A | None |

## Critical/High Findings

None.

## Findings Incorporated into SPRINT-003.md

The following items are added to the Definition of Done:

- [ ] `writeFakeScript` must use `JSON.stringify(chunks)` for embedding chunk content, not template literal interpolation
- [ ] Fake agent scripts created in unique temp directories per test (using `fs.mkdtemp()` or `crypto.randomUUID()`), with `0o700` permissions
- [ ] `shellEnv` test uses `vi.stubEnv('SHELL', '...')` for environment mutation (auto-restored by vitest)
- [ ] `mockObsidian.ts` includes a comment listing known behavioral differences from real Obsidian normalizePath

These are Low severity — appropriate for a test-only sprint with no new production attack surface.
