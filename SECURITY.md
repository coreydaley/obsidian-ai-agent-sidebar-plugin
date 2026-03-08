# Security Policy

## Supported Versions

Only the latest release is actively maintained and receives security fixes.

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✓         |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via [GitHub's private vulnerability reporting](https://github.com/coreydaley/obsidian-ai-agent-sidebar-plugin/security/advisories/new).
Include a description of the issue, steps to reproduce, and potential impact.
You will receive a response within 7 days.

## Security Considerations

### Data transmission

When you use this plugin, the content of your open note and any files the agent
reads are transmitted to third-party AI provider servers (Anthropic, OpenAI,
Google). Do not use this plugin with notes containing confidential, sensitive,
or personally identifiable information.

### CLI execution

In CLI mode the plugin spawns agent binaries (`claude`, `codex`, `copilot`)
with `shell: false`. Arguments are passed as arrays, not interpolated into a
shell string, to prevent command injection. Only binaries discovered by
`which`/`where` during plugin load are used; user-supplied extra CLI args are
split on whitespace and passed as separate array elements.

### File operations

All vault paths supplied by agents are validated against the vault root before
execution to prevent directory traversal. Delete operations always require
explicit user confirmation via a modal dialog.

### API keys

API keys are read from the shell environment at runtime and are never stored in
Obsidian's data store. Error messages are sanitised to redact key values before
being displayed or logged. Model names supplied by settings are validated
against a strict alphanumeric format before use.

### AI-generated content

This repository contains AI-assisted code. Review all configurations, scripts,
and logic before deploying in sensitive or production environments.
