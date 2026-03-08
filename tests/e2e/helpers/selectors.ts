// Plugin-owned selectors (data-testid attributes added to plugin source)
export const SIDEBAR_ROOT = '[data-testid="ai-agent-sidebar"]';
export const EMPTY_STATE = '[data-testid="ai-agent-empty-state"]';

export const SETTINGS_SECTION_ANTHROPIC = '[data-testid="ai-agent-settings-section-anthropic"]';
export const SETTINGS_SECTION_OPENAI = '[data-testid="ai-agent-settings-section-openai"]';
export const SETTINGS_SECTION_GOOGLE = '[data-testid="ai-agent-settings-section-google"]';
export const SETTINGS_SECTION_GITHUB = '[data-testid="ai-agent-settings-section-github"]';

export const ENABLE_TOGGLE_CLAUDE = '[data-testid="ai-agent-enable-toggle-claude"]';
export const ENABLE_TOGGLE_CODEX = '[data-testid="ai-agent-enable-toggle-codex"]';
export const ENABLE_TOGGLE_GEMINI = '[data-testid="ai-agent-enable-toggle-gemini"]';
export const ENABLE_TOGGLE_COPILOT = '[data-testid="ai-agent-enable-toggle-copilot"]';
export const ENABLE_TOGGLE_ANY = '[data-testid^="ai-agent-enable-toggle-"]';

// Obsidian structural selectors (stable aria-labels; change rarely)
export const RIBBON_OPEN_SIDEBAR = '[aria-label="Open AI agent sidebar"]';
export const COMMAND_PALETTE_TRIGGER = "Meta+p"; // Mod+P
export const COMMAND_PALETTE_INPUT = 'input[placeholder*="command"], .prompt-input';
export const SETTINGS_GEAR = '[aria-label="Settings"]';
export const SETTINGS_CLOSE = '[aria-label="Close"]';
export const WORKSPACE_CONTAINER = ".workspace";
