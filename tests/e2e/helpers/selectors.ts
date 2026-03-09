// Plugin-owned selectors (data-testid attributes added to plugin source)
export const SIDEBAR_ROOT = '[data-testid="ai-agent-sidebar"]';
export const EMPTY_STATE = '[data-testid="ai-agent-empty-state"]';

export const SETTINGS_SECTION_ANTHROPIC = '[data-testid="ai-agent-settings-section-anthropic"]';
export const SETTINGS_SECTION_OPENAI = '[data-testid="ai-agent-settings-section-openai"]';
export const SETTINGS_SECTION_GOOGLE = '[data-testid="ai-agent-settings-section-google"]';
export const SETTINGS_SECTION_GITHUB = '[data-testid="ai-agent-settings-section-github"]';
export const SETTINGS_SECTION_OPENAI_COMPAT = '[data-testid="ai-agent-settings-section-openai-compat"]';

// OpenAI Compatible provider field selectors
export const OPENAI_COMPAT_BASE_URL = '[data-testid="ai-agent-openai-compat-base-url"]';
export const OPENAI_COMPAT_API_KEY = '[data-testid="ai-agent-openai-compat-api-key"]';
export const OPENAI_COMPAT_MODEL = '[data-testid="ai-agent-openai-compat-model"]';

export const ENABLE_TOGGLE_CLAUDE = '[data-testid="ai-agent-enable-toggle-claude"]';
export const ENABLE_TOGGLE_CODEX = '[data-testid="ai-agent-enable-toggle-codex"]';
export const ENABLE_TOGGLE_GEMINI = '[data-testid="ai-agent-enable-toggle-gemini"]';
export const ENABLE_TOGGLE_COPILOT = '[data-testid="ai-agent-enable-toggle-copilot"]';
export const ENABLE_TOGGLE_OPENAI_COMPAT = '[data-testid="ai-agent-enable-toggle-openai-compat"]';
export const ENABLE_TOGGLE_ANY = '[data-testid^="ai-agent-enable-toggle-"]';

// Sidebar tab button selectors
export const TAB_BTN_CLAUDE = '[data-testid="ai-agent-tab-claude"]';
export const TAB_BTN_CODEX = '[data-testid="ai-agent-tab-codex"]';
export const TAB_BTN_GEMINI = '[data-testid="ai-agent-tab-gemini"]';
export const TAB_BTN_COPILOT = '[data-testid="ai-agent-tab-copilot"]';
export const TAB_BTN_OPENAI_COMPAT = '[data-testid="ai-agent-tab-openai-compat"]';

// Mode row (only for dual-mode agents: claude, codex)
export const MODE_ROW_CLAUDE = '[data-testid="ai-agent-mode-row-claude"]';
export const MODE_ROW_CODEX = '[data-testid="ai-agent-mode-row-codex"]';

// Mode flip switch label (contains the checkbox input)
export const MODE_FLIP_CLAUDE = '[data-testid="ai-agent-mode-flip-claude"]';
export const MODE_FLIP_CODEX = '[data-testid="ai-agent-mode-flip-codex"]';

// Extra CLI args inputs (present in CLI mode for CLI-capable agents)
export const EXTRA_ARGS_CLAUDE = '[data-testid="ai-agent-extra-args-claude"]';
export const EXTRA_ARGS_CODEX = '[data-testid="ai-agent-extra-args-codex"]';
export const EXTRA_ARGS_COPILOT = '[data-testid="ai-agent-extra-args-copilot"]';

// Model field rows (present in API mode for API-capable agents)
export const MODEL_FIELD_CLAUDE = '[data-testid="ai-agent-model-field-claude"]';
export const MODEL_FIELD_CODEX = '[data-testid="ai-agent-model-field-codex"]';
export const MODEL_FIELD_GEMINI = '[data-testid="ai-agent-model-field-gemini"]';

// Chat UI selectors
export const CHAT_INPUT = '[data-testid="ai-agent-chat-input"]';
export const CHAT_SUBMIT = '[data-testid="ai-agent-chat-submit"]';
export const CHAT_MSG_ASSISTANT = '[data-testid="ai-agent-chat-message-assistant"]';
export const CHAT_MSG_USER = '[data-testid="ai-agent-chat-message-user"]';
export const CHAT_ERROR = '[data-testid="ai-agent-chat-error"]';

// Obsidian structural selectors (stable aria-labels; change rarely)
export const RIBBON_OPEN_SIDEBAR = '[aria-label="Open AI agent sidebar"]';
export const COMMAND_PALETTE_TRIGGER = "Meta+p"; // Mod+P
export const COMMAND_PALETTE_INPUT = 'input[placeholder*="command"], .prompt-input';
export const SETTINGS_GEAR = '[aria-label="Settings"]';
export const SETTINGS_CLOSE = '[aria-label="Close"]';
export const WORKSPACE_CONTAINER = ".workspace";
