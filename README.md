# AI Agent Sidebar for Obsidian

An Obsidian plugin that adds a sidebar where you can chat with AI CLI agents (Claude Code, Codex, Gemini, Copilot) and have them read, create, update, rename, and delete files in your vault.

## Features

- **Multi-agent tabs**: Switch between enabled agents without losing your conversation history
- **Vault CRUD**: Agents can read, create, edit, rename, and delete your notes
- **Streaming responses**: See responses token-by-token as they arrive
- **Auto-context**: The currently open note is automatically shared with the agent
- **Settings page**: See which agents are installed, enable/disable them, and configure CLI arguments

## Requirements

- Obsidian desktop (not supported on mobile)
- At least one supported CLI agent installed and authenticated:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — `claude`
  - [OpenAI Codex](https://github.com/openai/codex) — `codex`
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli) — `gemini`
  - [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) — `copilot`

## Installation

1. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/obsidian-ai-agent-sidebar/` folder
2. Enable the plugin in **Settings → Community Plugins**
3. Open the AI Agent Sidebar from the ribbon or command palette

## Configuration

Open **Settings → AI Agent Sidebar** to:

- See which agents are installed on your system
- Enable or disable individual agents
- Pass extra CLI arguments to each agent (e.g. `--model claude-opus-4-5`)

> **Model selection**: Model selection is handled by each CLI agent's own configuration. To override the model for a specific agent, add a `--model <name>` flag in the Extra CLI Arguments field.

## How Vault Operations Work

When you ask an agent to read, create, edit, rename, or delete files, it emits structured operation blocks that the plugin intercepts and executes using Obsidian's vault API. You'll see file operation cards in the chat indicating what was done.

Delete operations always require your confirmation before executing.

## Privacy Notice

When you use this plugin, the content of your vault files (including the currently open note) is transmitted to the AI provider's servers by the CLI agent. **Do not use this plugin with notes containing confidential, sensitive, or personally identifiable information you do not want sent to third-party AI services.**

## License

MIT
