# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-08

### Added
- Multi-agent tab bar supporting Claude Code, OpenAI Codex, Google Gemini, and GitHub Copilot
- CLI mode: invoke installed agent binaries (`claude`, `codex`, `copilot`) via `child_process.spawn`
- API mode: stream responses directly from Anthropic, OpenAI, and Google APIs
- Per-agent toggle between CLI and API access mode in settings
- YOLO mode: prepend skip-confirmation flags for unattended CLI runs
- Model selector in API mode populated from the provider's live model list
- Vault CRUD operations via a `:::file-op` structured block protocol intercepted mid-stream
- File operation cards in the chat showing operation type, path, and success/failure
- Delete operations always prompt for confirmation before executing
- Auto-context: currently open note content injected into every system prompt (up to 8 KB)
- Streaming token-by-token responses for both CLI and API modes
- Debug mode: toggle raw CLI output and API request details in the chat panel
- Persist conversations option to save and restore chat history across Obsidian restarts
- Shell environment resolution to pick up API keys set in `.zshrc` / `.bash_profile`
- GitHub Actions release workflow that publishes `main.js`, `manifest.json`, and `styles.css`

[Unreleased]: https://github.com/coreydaley/obsidian-ai-agent-sidebar-plugin/compare/0.1.0...HEAD
[0.1.0]: https://github.com/coreydaley/obsidian-ai-agent-sidebar-plugin/releases/tag/0.1.0
