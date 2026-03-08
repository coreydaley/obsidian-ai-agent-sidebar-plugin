import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type AgentSidebarPlugin from "./main";
import type { AgentDetectionResult, AgentId, PluginSettings } from "./types";
import { AGENT_ADAPTERS } from "./AgentRunner";
import { SHELL_INJECTION_PATTERN } from "./AgentDetector";

export const DEFAULT_SETTINGS: PluginSettings = {
  agents: {
    claude: { enabled: true, extraArgs: "" },
    codex: { enabled: true, extraArgs: "" },
    gemini: { enabled: true, extraArgs: "" },
    copilot: { enabled: true, extraArgs: "" },
  },
  persistConversations: false,
  debugMode: false,
  workingDirectory: undefined,
};

export class AgentSidebarSettingTab extends PluginSettingTab {
  plugin: AgentSidebarPlugin;
  private detectionResults: AgentDetectionResult[] = [];

  constructor(app: App, plugin: AgentSidebarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "AI Agent Sidebar" });

    // Run detection to get current state
    this.detectionResults = await this.plugin.agentDetector.rescan(AGENT_ADAPTERS);

    this.renderAgentsSection(containerEl);
    this.renderGlobalSection(containerEl);
  }

  private renderAgentsSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Agents" });

    const rescanSetting = new Setting(containerEl)
      .setName("Installed agents")
      .setDesc("Agents detected on your system. Enable or disable them in the sidebar.")
      .addButton((btn) => {
        btn.setButtonText("Re-scan").onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText("Scanning…");
          this.detectionResults = await this.plugin.agentDetector.rescan(AGENT_ADAPTERS);
          await this.display();
        });
      });

    rescanSetting.settingEl.style.flexWrap = "wrap";

    for (const adapter of AGENT_ADAPTERS) {
      const detection = this.detectionResults.find((r) => r.id === adapter.id);
      const isInstalled = detection?.isInstalled ?? false;
      const agentConfig = this.plugin.settings.agents[adapter.id];

      const agentEl = containerEl.createDiv({ cls: "ai-sidebar-agent-setting" });

      // Agent header row
      const headerEl = agentEl.createDiv({ cls: "ai-sidebar-agent-header" });
      const titleEl = headerEl.createDiv({ cls: "ai-sidebar-agent-title" });
      titleEl.createSpan({ text: adapter.name, cls: "ai-sidebar-agent-name" });

      const badge = titleEl.createSpan({
        text: isInstalled ? "Installed" : "Not installed",
        cls: `ai-sidebar-badge ${isInstalled ? "ai-sidebar-badge--installed" : "ai-sidebar-badge--missing"}`,
      });
      badge.title = isInstalled ? `Found at: ${detection?.path}` : `Command '${adapter.command}' not found in PATH`;

      // Command / path info
      const pathEl = agentEl.createDiv({ cls: "ai-sidebar-agent-path" });
      if (isInstalled && detection) {
        pathEl.createSpan({ text: "Command: ", cls: "ai-sidebar-agent-path-label" });
        pathEl.createSpan({ text: detection.path, cls: "ai-sidebar-agent-path-value" });
      } else {
        pathEl.createSpan({ text: `Command '${adapter.command}' not found in PATH`, cls: "ai-sidebar-agent-path-missing" });
      }

      // Enable toggle
      new Setting(agentEl)
        .setName("Enable")
        .setDesc(isInstalled ? "Show this agent in the sidebar" : "Agent not installed — cannot enable")
        .addToggle((toggle) => {
          toggle
            .setValue(agentConfig.enabled && isInstalled)
            .setDisabled(!isInstalled)
            .onChange(async (value) => {
              this.plugin.settings.agents[adapter.id].enabled = value;
              await this.plugin.saveSettings();
              this.plugin.agentSidebarView?.refreshTabs();
            });
        });

      // Extra CLI args
      new Setting(agentEl)
        .setName("Extra CLI arguments")
        .setDesc(
          "Additional flags passed to the agent on startup. " +
            "Model selection is handled by the CLI agent's own configuration. " +
            "To override, pass e.g. --model claude-opus-4-5 here."
        )
        .addText((text) => {
          text
            .setPlaceholder("e.g. --model claude-opus-4-5 --max-tokens 4096")
            .setValue(agentConfig.extraArgs)
            .onChange(async (value) => {
              if (SHELL_INJECTION_PATTERN.test(value)) {
                new Notice(
                  `Extra args contain unsafe characters. Remove ; | & \` $( > and try again.`
                );
                return;
              }
              this.plugin.settings.agents[adapter.id as AgentId].extraArgs = value;
              await this.plugin.saveSettings();
            });
        });
    }
  }

  private renderGlobalSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Global Options" });

    new Setting(containerEl)
      .setName("Persist conversations")
      .setDesc("Save and restore chat history across Obsidian restarts. (Coming in v2 — toggle saved but not yet active)")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.persistConversations).onChange(async (value) => {
          this.plugin.settings.persistConversations = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Debug mode")
      .setDesc("Show all raw stdout and stderr output from the CLI agent in the chat. Useful for diagnosing hangs or unexpected behaviour.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.debugMode).onChange(async (value) => {
          this.plugin.settings.debugMode = value;
          await this.plugin.saveSettings();
        });
      });
  }
}
