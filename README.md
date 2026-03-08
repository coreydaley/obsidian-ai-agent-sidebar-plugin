# AI Agent Sidebar for Obsidian

An Obsidian plugin that adds a sidebar where you can chat with AI agents (Claude Code, OpenAI Codex, Google Gemini, GitHub Copilot) and have them read, create, edit, rename, and delete files in your vault. Agents can be used via their CLI tools or directly through their APIs.

## Features

- **Multi-agent tabs**: Switch between enabled agents without losing conversation history
- **CLI and API modes**: Use agents via their installed CLI tools or directly via API key
- **Vault CRUD**: Agents can read, create, edit, rename, and delete your notes
- **Streaming responses**: See responses token-by-token as they arrive
- **Auto-context**: The currently open note is automatically shared with the agent
- **Model selection**: In API mode, fetch available models and select one from the settings page
- **Debug mode**: Optionally show raw CLI output and API request details in the chat panel

## Supported Agents

| Agent | Provider | CLI Command | API Only |
| --- | --- | --- | --- |
| Claude Code | Anthropic | `claude` | No |
| OpenAI Codex | OpenAI | `codex` | No |
| Google Gemini | Google | — | Yes |
| GitHub Copilot | GitHub | `copilot` | No |

Obsidian desktop only — mobile is not supported.

## Requirements

At least one of the following must be installed and authenticated:

- **Claude Code** — [docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code)
- **OpenAI Codex CLI** — [github.com/openai/codex](https://github.com/openai/codex)
- **GitHub Copilot CLI** — [docs.github.com/en/copilot/github-copilot-in-the-cli](https://docs.github.com/en/copilot/github-copilot-in-the-cli)
- **A Google Gemini API key** — Gemini is API-only; no CLI is required

## Installation

1. Run `npm run build` to produce `main.js`
2. Copy `main.js`, `manifest.json`, and `styles.css` to:

   ```text
   <vault>/.obsidian/plugins/obsidian-ai-agent-sidebar/
   ```

3. Enable the plugin in **Settings → Community Plugins**
4. Open the AI Agent Sidebar from the ribbon icon or command palette

## API Keys

API mode is available for Claude, Codex, and Gemini. The plugin reads API keys from your shell environment — set them in your shell profile (`.zshrc`, `.bash_profile`, etc.) and restart Obsidian.

### Claude (Anthropic)

The plugin checks these environment variables in order:

```text
OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY
ANTHROPIC_API_KEY
```

Get a key at [console.anthropic.com](https://console.anthropic.com).

### Codex (OpenAI)

```text
OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_API_KEY
OPENAI_API_KEY
```

Get a key at [platform.openai.com](https://platform.openai.com).

### Gemini (Google)

```text
OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_API_KEY
GEMINI_API_KEY
GOOGLE_API_KEY
```

Get a key at [aistudio.google.com](https://aistudio.google.com).

### GitHub Copilot

Copilot is CLI-only and uses its own authentication (`gh auth login`). No API key is needed.

## Configuration

Open **Settings → AI Agent Sidebar** to configure each provider.

### Access Mode (CLI vs API)

For agents that support both, a toggle switches between CLI and API mode. CLI mode invokes the installed tool; API mode calls the provider's API directly using your key.

- **CLI mode**: shows an Extra CLI Args field and (where supported) a YOLO mode option
- **API mode**: shows a model selector populated from the provider's live model list

### YOLO Mode

When enabled, the following flags are prepended to every CLI invocation, disabling interactive confirmation prompts:

| Agent | YOLO flags |
| --- | --- |
| Claude Code | `--dangerously-skip-permissions` |
| OpenAI Codex | `--full-auto` |
| GitHub Copilot | `--allow-all` |

### Default Models (API mode)

If the model list cannot be fetched, the plugin falls back to these defaults:

| Agent | Default models |
| --- | --- |
| Claude | `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5-20251001` |
| Codex | `gpt-4o`, `gpt-4o-mini`, `o1`, `o1-mini` |
| Gemini | `gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash` |

### Global Options

| Option | Default | Description |
| --- | --- | --- |
| Persist conversations | Off | Save and restore chat history across Obsidian restarts |
| Debug mode | Off | Show raw CLI output and API request details in the chat panel |

## Vault Operations

Agents can perform the following file operations on your vault:

| Operation | Description |
| --- | --- |
| `read` | Read the contents of a file |
| `write` | Create or overwrite a file (parent folders are created automatically) |
| `delete` | Delete a file — always requires your confirmation |
| `rename` | Rename or move a file |
| `list` | List the contents of a directory |

The plugin intercepts structured operation blocks emitted by the agent, executes them via Obsidian's vault API, and displays file operation cards in the chat showing what was done and whether it succeeded.

All file paths are validated against the vault root to prevent directory traversal. Delete operations always show a confirmation dialog before executing.

## Privacy

When you use this plugin, the content of your open note and any files the agent reads are sent to the AI provider's servers. **Do not use this plugin with notes containing confidential, sensitive, or personally identifiable information you do not want transmitted to third-party AI services.**

## Building

```sh
npm install
npm run build   # production build
npm run dev     # watch mode for development
```

## License

MIT
