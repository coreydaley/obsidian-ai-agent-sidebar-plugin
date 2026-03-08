import { Plugin } from "obsidian";
import { AgentDetector } from "./AgentDetector";
import { AGENT_ADAPTERS } from "./AgentRunner";
import { AgentSidebarView, AGENT_SIDEBAR_VIEW_TYPE } from "./AgentSidebarView";
import { AgentSidebarSettingTab, DEFAULT_SETTINGS } from "./settings";
import type { PluginSettings } from "./types";

export default class AgentSidebarPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  agentDetector: AgentDetector = new AgentDetector();
  agentSidebarView: AgentSidebarView | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Detect installed agents
    await this.agentDetector.detect(AGENT_ADAPTERS);

    // Register the sidebar view
    this.registerView(
      AGENT_SIDEBAR_VIEW_TYPE,
      (leaf) => {
        const view = new AgentSidebarView(leaf, this);
        this.agentSidebarView = view;
        return view;
      }
    );

    // Ribbon icon
    this.addRibbonIcon("bot", "Open AI Agent Sidebar", () => {
      this.activateSidebar();
    });

    // Command palette entry
    this.addCommand({
      id: "open-ai-agent-sidebar",
      name: "Open AI Agent Sidebar",
      callback: () => {
        this.activateSidebar();
      },
    });

    // Settings tab
    this.addSettingTab(new AgentSidebarSettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    // AgentChatTab.destroy() disposes runners (kills child processes)
    // AgentSidebarView.onClose() calls destroyAllTabs()
    // Nothing extra needed here since view lifecycle handles it
  }

  async loadSettings(): Promise<void> {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);

    // Ensure all agent configs exist (handles new agents added in future versions)
    for (const adapter of AGENT_ADAPTERS) {
      if (!this.settings.agents[adapter.id]) {
        this.settings.agents[adapter.id] = { enabled: true, extraArgs: "" };
      }
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async activateSidebar(): Promise<void> {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(AGENT_SIDEBAR_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type: AGENT_SIDEBAR_VIEW_TYPE, active: true });
    }

    workspace.revealLeaf(leaf);
  }
}
