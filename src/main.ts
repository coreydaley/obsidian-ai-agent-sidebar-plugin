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

    // Ensure all agent configs exist and have required fields (migration from SPRINT-001)
    const agentIds: Array<keyof typeof this.settings.agents> = ["claude", "codex", "gemini", "copilot"];
    const defaultAccessModes: Record<string, "cli" | "api"> = {
      claude: "cli", codex: "cli", gemini: "api", copilot: "cli",
    };
    for (const id of agentIds) {
      if (!this.settings.agents[id]) {
        this.settings.agents[id] = { enabled: false, extraArgs: "", yoloMode: false, accessMode: defaultAccessModes[id] ?? "cli" };
      } else {
        // Migrate: add accessMode if missing
        if (!this.settings.agents[id].accessMode) {
          this.settings.agents[id].accessMode = id === "gemini" ? "api" : "cli";
        }
        // Migrate: if gemini was enabled with CLI mode (SPRINT-001 state), switch to api
        if (id === "gemini" && this.settings.agents[id].accessMode === "cli") {
          this.settings.agents[id].accessMode = "api";
        }
        // Migrate: add yoloMode if missing
        if (this.settings.agents[id].yoloMode === undefined) {
          this.settings.agents[id].yoloMode = false;
        }
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
