PLUGIN_ID        := obsidian-ai-agent-sidebar
VAULT_DIR        := vault
VAULT_PLUGIN_DIR := $(VAULT_DIR)/.obsidian/plugins/$(PLUGIN_ID)
HOT_RELOAD_DIR   := $(VAULT_DIR)/.obsidian/plugins/hot-reload
HOT_RELOAD_VER   := 0.3.0
HOT_RELOAD_BASE  := https://github.com/pjeby/hot-reload/releases/download/$(HOT_RELOAD_VER)

.PHONY: dev vault-setup build install clean test test-unit test-integration test-all test-e2e lint help

dev: vault-setup
	@echo "Starting watcher — changes to src/ will sync to $(VAULT_PLUGIN_DIR) automatically."
	npm run dev

vault-setup: clean build
	@echo "Creating sample vault..."
	mkdir -p $(VAULT_PLUGIN_DIR)
	mkdir -p $(HOT_RELOAD_DIR)
	@echo '["hot-reload","$(PLUGIN_ID)"]' > $(VAULT_DIR)/.obsidian/community-plugins.json
	curl -fsSL $(HOT_RELOAD_BASE)/main.js -o $(HOT_RELOAD_DIR)/main.js
	curl -fsSL $(HOT_RELOAD_BASE)/manifest.json -o $(HOT_RELOAD_DIR)/manifest.json
	touch $(VAULT_PLUGIN_DIR)/.hotreload
	@printf '# AI Agent Sidebar — Test Vault\n\nThis is a sample vault for testing the AI Agent Sidebar plugin.\n\nOpen the sidebar using the bot icon in the ribbon or via the command palette: **Open AI Agent Sidebar**.\n\n## Sample Notes\n\n- [[Meeting Notes]]\n- [[Project Ideas]]\n' > "$(VAULT_DIR)/Welcome.md"
	@printf '# Meeting Notes\n\n## 2026-03-07 — Project Kickoff\n\n**Attendees**: Engineering team\n\n**Topics**:\n- Reviewed project scope for AI Agent Sidebar plugin\n- Decided to support Claude Code, Codex, Gemini, and Copilot CLI\n- Agreed on :::file-op protocol for structured vault operations\n\n**Action Items**:\n- [ ] Set up dev vault for testing\n- [ ] Install at least one CLI agent\n- [ ] Test end-to-end flow with Claude Code\n' > "$(VAULT_DIR)/Meeting Notes.md"
	@printf '# Project Ideas\n\nA scratch pad for testing the AI agent'\''s read/write capabilities.\n\n## Ideas to Explore\n\n- Ask the agent to summarize Meeting Notes\n- Ask the agent to create a new note\n- Ask the agent to add items to this list\n' > "$(VAULT_DIR)/Project Ideas.md"
	cp main.js manifest.json styles.css $(VAULT_PLUGIN_DIR)/
	@echo "Vault ready. Open vault/ in Obsidian to test."

build:
	npm run build

test:
	@echo "Available test targets:"
	@echo "  make test-unit         Run unit tests"
	@echo "  make test-integration  Run integration tests"
	@echo "  make test-all          Run unit and integration tests"

test-unit:
	npm test

test-integration:
	npm run test-integration

test-all: test-unit test-integration

test-e2e: build
	npm run test-e2e

lint:
	npm run lint

clean:
	rm -f main.js
	rm -rf $(VAULT_DIR)

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets:"
	@echo "  dev               Build and start watch mode with hot-reload vault"
	@echo "  build             Type-check and bundle (production)"
	@echo "  test              Show available test targets"
	@echo "  test-unit         Run unit tests"
	@echo "  test-integration  Run integration tests"
	@echo "  test-all          Run unit and integration tests"
	@echo "  lint              Lint source files"
	@echo "  vault-setup       Create sample Obsidian vault with plugin installed"
	@echo "  clean             Remove build output and vault directory"
	@echo "  help              Show this help message"
