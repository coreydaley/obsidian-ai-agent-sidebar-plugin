PLUGIN_ID := obsidian-ai-agent-sidebar
VAULT_DIR  := vault
VAULT_PLUGIN_DIR := $(VAULT_DIR)/.obsidian/plugins/$(PLUGIN_ID)

.PHONY: dev build install clean

dev: clean build
	@echo "Creating sample vault..."
	mkdir -p $(VAULT_PLUGIN_DIR)
	@echo '["$(PLUGIN_ID)"]' > $(VAULT_DIR)/.obsidian/community-plugins.json
	@printf '# AI Agent Sidebar — Test Vault\n\nThis is a sample vault for testing the AI Agent Sidebar plugin.\n\nOpen the sidebar using the bot icon in the ribbon or via the command palette: **Open AI Agent Sidebar**.\n\n## Sample Notes\n\n- [[Meeting Notes]]\n- [[Project Ideas]]\n' > "$(VAULT_DIR)/Welcome.md"
	@printf '# Meeting Notes\n\n## 2026-03-07 — Project Kickoff\n\n**Attendees**: Engineering team\n\n**Topics**:\n- Reviewed project scope for AI Agent Sidebar plugin\n- Decided to support Claude Code, Codex, Gemini, and Copilot CLI\n- Agreed on :::file-op protocol for structured vault operations\n\n**Action Items**:\n- [ ] Set up dev vault for testing\n- [ ] Install at least one CLI agent\n- [ ] Test end-to-end flow with Claude Code\n' > "$(VAULT_DIR)/Meeting Notes.md"
	@printf '# Project Ideas\n\nA scratch pad for testing the AI agent'\''s read/write capabilities.\n\n## Ideas to Explore\n\n- Ask the agent to summarize Meeting Notes\n- Ask the agent to create a new note\n- Ask the agent to add items to this list\n' > "$(VAULT_DIR)/Project Ideas.md"
	cp main.js manifest.json $(VAULT_PLUGIN_DIR)/
	cp src/styles.css $(VAULT_PLUGIN_DIR)/
	@echo "Done. Open vault/ as a vault in Obsidian to test."

build:
	npm run build

clean:
	rm -f main.js
	rm -rf $(VAULT_DIR)
