# Sprint 004 Security Review

## Scope

Security audit of `docs/sprints/SPRINT-004.md` before implementation begins.

---

## Findings

### 1. Temp directory traversal via vault path injection — **Low**

**Section**: `Vault Setup`, `vaultFactory.ts`

`fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-e2e-'))` creates a uniquely named temp directory. The vault path is then passed to Electron as a CLI arg. There is no user-supplied input in this path — it is entirely machine-generated — so path traversal is not a practical risk. However, the plan does not specify that the vault path should be validated before being passed to `electron.launch()`.

**Mitigation**: In `vaultFactory.ts`, verify the returned temp path starts with `os.tmpdir()` before proceeding. This is a defense-in-depth measure.

**DoD addition**: None required (risk is low, mitigation is a simple check in implementation).

---

### 2. Electron launch args as user-configurable `OBSIDIAN_BINARY` env var — **Medium**

**Section**: `Binary Discovery`, `obsidianBinary.ts`

The `OBSIDIAN_BINARY` environment variable is read as the Obsidian binary path. If a developer or CI environment variable is misconfigured or compromised (e.g., set to `rm -rf /`), the `electron.launch()` call would execute an arbitrary binary.

The plan already requires: "Binary path must be an absolute path to a readable executable file; relative paths or non-executable paths are rejected." This is the correct mitigation.

**Mitigation (already in plan)**: `findObsidianBinary()` must validate: (a) path is absolute, (b) `fs.accessSync(path, fs.constants.X_OK)` passes. If either fails, return `null`.

**DoD addition**: Added below — validate `OBSIDIAN_BINARY` is absolute and executable.

---

### 3. Electron launch args array — **Low**

**Section**: `Obsidian Launch`, `electronHarness.ts`

The plan uses `electron.launch({ args: [vaultPath] })` — args passed as an array, not a shell string. This correctly prevents shell injection. No concern.

---

### 4. Screenshot data leakage — **Low**

**Section**: `Phase 5`, `Definition of Done`

Playwright screenshots on failure capture the Obsidian window, which shows the test vault contents. The test vault contains only generated sample notes (`Welcome.md`), not real user data. Screenshots are saved to `tests/e2e/artifacts/` which is gitignored.

**Residual risk**: If a developer runs E2E tests against their real vault (by misusing `OBSIDIAN_BINARY` with a pre-configured personal vault), screenshots might capture personal note content. This is out of scope for this sprint's design (E2E always creates a fresh temp vault per run), but worth documenting.

**Mitigation**: The temp vault creation in `vaultFactory.ts` is the primary guard — tests never reference user vaults. Document in `tests/e2e/README.md` that `OBSIDIAN_BINARY` should point only to the Obsidian binary, not a pre-configured instance.

---

### 5. Trust modal auto-dismiss — **Medium**

**Section**: `Obsidian Launch` startup handling, devil's advocate response in DoD

The harness auto-clicks through Obsidian's "Trust this plugin" modal. If the modal text matching heuristic targets a wrong modal (e.g., a security warning or data loss dialog), the harness could accidentally dismiss a critical prompt.

**Mitigation (already incorporated from devil's advocate)**: Match against specific known modal text; log a warning (don't silently click) if the text doesn't match. This is correct.

**DoD addition**: None new required (already in updated DoD: "logs a warning rather than silently clicking wrong controls").

---

### 6. No new attack surface in production code — **Low / Informational**

**Section**: `Phase 3` (data-testid additions to `src/`)

The only production code changes are adding `setAttribute('data-testid', ...)` calls to DOM elements. These attributes are rendered to the Obsidian UI as HTML data attributes. They contain only static, developer-defined string literals (no user input). There is no injection surface and no new trust boundary.

---

### 7. Dependency risk: `playwright` package — **Low**

**Section**: `Phase 1`, `package.json`

The plan requires `playwright` as a pinned devDependency. Playwright is a well-maintained Microsoft project with a strong security track record. It is added as a devDependency (not in the production bundle). No concern.

**Mitigation**: Pin exact version (no `^` or `~`); run `npm audit` after install.

**DoD addition**: `npm audit` runs after `playwright` is added; no high/critical findings unresolved.

---

### 8. Threat model: test vault contents could be captured by a malicious Obsidian plugin — **Low**

**Context**: `CLAUDE.md` notes this is a desktop-only plugin. The test vault has `community-plugins.json` pre-set to enable only `ai-agent-sidebar`. If a compromised version of Obsidian were launched, it could access the temp vault. This is a theoretical concern with no practical attack path in a dev environment.

**Mitigation**: Not applicable for this sprint. The risk is equivalent to any local process having temp directory access.

---

## Summary

| Finding | Severity | Status |
|---------|----------|--------|
| `OBSIDIAN_BINARY` env var not validated as executable | Medium | Already in plan; add explicit DoD item |
| Trust modal heuristic clicks wrong control | Medium | Already incorporated from devil's advocate |
| Temp vault path not validated before launch | Low | Add simple `startsWith(os.tmpdir())` check in implementation |
| Screenshot data in gitignored artifacts | Low | Document in `tests/e2e/README.md` |
| `playwright` dependency risk | Low | Pin + `npm audit` required |
| `data-testid` in production DOM | Low / Informational | No risk; static string literals only |

## DoD Additions for Critical/High Findings

No Critical or High findings. Medium findings already addressed in the plan or covered by existing DoD items. The following addition is recommended for completeness:

- [ ] `npm audit` run after `playwright` devDependency is added; no high/critical severity findings unresolved before sprint is complete
