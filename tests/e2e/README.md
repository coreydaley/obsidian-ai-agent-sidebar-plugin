# E2E Test Suite

End-to-end tests for the AI Agent Sidebar Obsidian plugin using Playwright's Electron API via Vitest.

## Tested Configuration

- **Obsidian version**: 1.12.4
- **Platform**: macOS (arm64)
- **Playwright**: 1.58.2

## How to Run

```sh
# Ensure the plugin is built first
npm run build

# Run E2E tests
make test-e2e
# or
npm run test-e2e
```

Tests are skipped automatically if Obsidian is not installed. The suite exits 0 with a clear skip message in that case.

If Obsidian is found but fails to launch, the suite exits non-zero (hard fail, not skip).

## Skip vs. Fail

| Condition | Exit code |
|-----------|-----------|
| Obsidian binary not found | 0 (skip) |
| `main.js` missing | non-zero (error) |
| Obsidian launches but test fails | non-zero (fail) |
| Obsidian found, launch fails | non-zero (fail) |

## Overriding Binary Path

Set `OBSIDIAN_BINARY` to an absolute path to the Obsidian executable to override platform defaults:

```sh
OBSIDIAN_BINARY=/path/to/Obsidian npm run test-e2e
```

## Failure Artifacts

Screenshots on test failure are saved to `tests/e2e/artifacts/` (gitignored). The HTML report is written to `tests/e2e/artifacts/report.html`.

## Prerequisites

Before running E2E tests, enable Obsidian's command-line interface:

1. Open Obsidian → Settings → General → Advanced
2. Enable **Command line interface**

Playwright's Electron API injects `--inspect` and `--remote-debugging-port` flags. Obsidian 1.12.4+ requires CLI mode to be enabled before it accepts these flags. If CLI mode is disabled, the suite will exit non-zero with a "Process failed to launch!" error (this is a hard fail, not a skip).

## Known Limitations

- Tests require Obsidian to be installed locally — no headless CI support.
- Only one test vault is active at a time (serial execution: `fileParallelism: false`).
- Agent interaction (sending messages, streaming responses) is out of scope — this suite validates plugin load, sidebar open, and settings UI only.
- Vault picker bypass via positional `args: [vaultPath]` has been verified on macOS 1.12.4; behaviour on other platforms may vary.
