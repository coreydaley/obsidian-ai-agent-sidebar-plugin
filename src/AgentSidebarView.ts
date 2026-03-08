import { ItemView, WorkspaceLeaf } from "obsidian";
import { appendAgentIcon } from "./icons";
import { AgentChatTab } from "./AgentChatTab";
import { FileOperationsHandler } from "./FileOperationsHandler";
import { createRunner } from "./runnerFactory";
import { PROVIDERS } from "./providers";
import type { AgentDetectionResult } from "./types";
import type AgentSidebarPlugin from "./main";

export const AGENT_SIDEBAR_VIEW_TYPE = "agent-sidebar-view";

export class AgentSidebarView extends ItemView {
  private plugin: AgentSidebarPlugin;
  private tabBar: HTMLElement;
  private chatContainer: HTMLElement;
  private tabs: Map<string, { tab: AgentChatTab; btn: HTMLElement }> = new Map();
  private activeAgentId: string | null = null;
  private fileOpsHandler: FileOperationsHandler;

  constructor(leaf: WorkspaceLeaf, plugin: AgentSidebarPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.fileOpsHandler = new FileOperationsHandler(this.app);
  }

  getViewType(): string {
    return AGENT_SIDEBAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "AI agent sidebar";
  }

  getIcon(): string {
    return "bot";
  }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("ai-sidebar-root");

    this.chatContainer = root.createDiv({ cls: "ai-sidebar-chat-container" });
    this.tabBar = root.createDiv({ cls: "ai-sidebar-tab-bar" });

    await this.buildTabs();
  }

  onClose(): Promise<void> {
    this.destroyAllTabs();
    return Promise.resolve();
  }

  private async buildTabs(): Promise<void> {
    this.destroyAllTabs();
    this.tabBar.empty();
    this.chatContainer.empty();

    const detectionResults = this.plugin.agentDetector.getCache() ?? [];
    const enabledAgents = this.getEnabledAgents(detectionResults);

    if (enabledAgents.length === 0) {
      this.renderEmptyState();
      return;
    }

    for (const detection of enabledAgents) {
      await this.addAgentTab(detection);
    }

    if (enabledAgents.length > 0) {
      this.activateTab(enabledAgents[0].id);
    }
  }

  private getEnabledAgents(detectionResults: AgentDetectionResult[]): AgentDetectionResult[] {
    // Iterate in PROVIDERS order; include both CLI-detected and API-key-detected agents
    return PROVIDERS
      .map((provider) => {
        const detection = detectionResults.find((r) => r.id === provider.agentId);
        if (!detection) return null;
        const config = this.plugin.settings.agents[detection.id];
        if (!config.enabled) return null;
        if (!detection.isInstalled && !detection.hasApiKey) return null;
        return detection;
      })
      .filter((r): r is AgentDetectionResult => r !== null);
  }

  private async addAgentTab(detection: AgentDetectionResult): Promise<void> {
    const tabBtn = this.tabBar.createEl("button", { cls: "ai-sidebar-tab-btn" });
    tabBtn.title = detection.name;
    const provider = PROVIDERS.find(p => p.agentId === detection.id);
    if (provider) tabBtn.dataset.provider = provider.id;
    appendAgentIcon(tabBtn, detection.id);
    tabBtn.addEventListener("click", () => this.activateTab(detection.id));

    const paneEl = this.chatContainer.createDiv({ cls: "ai-sidebar-pane ai-sidebar-hidden" });

    const detectionResults = this.plugin.agentDetector.getCache() ?? [];
    const runner = await createRunner(
      detection.id,
      this.plugin.settings,
      detectionResults,
      this.fileOpsHandler
    );

    const chatTab = new AgentChatTab(paneEl, runner, detection, this.app, this.plugin);
    this.tabs.set(detection.id, { tab: chatTab, btn: tabBtn });
  }

  private activateTab(agentId: string): void {
    if (this.activeAgentId) {
      const current = this.tabs.get(this.activeAgentId);
      if (current) {
        current.btn.removeClass("ai-sidebar-tab-btn--active");
        current.tab.hide();
      }
    }

    const next = this.tabs.get(agentId);
    if (!next) return;

    next.btn.addClass("ai-sidebar-tab-btn--active");
    next.tab.show();
    this.activeAgentId = agentId;
  }

  private renderEmptyState(): void {
    const emptyEl = this.chatContainer.createDiv({ cls: "ai-sidebar-no-agents" });
    emptyEl.createEl("p", { text: "No agents enabled." });
    emptyEl.createEl("p", {
      text: "Open settings → AI agent sidebar to install and enable agents.",
      cls: "ai-sidebar-empty-hint",
    });
  }

  async refreshTabs(): Promise<void> {
    await this.buildTabs();
  }

  hasConversationHistory(agentId: string): boolean {
    const tab = this.tabs.get(agentId);
    if (!tab) return false;
    return tab.tab.getHistory().length > 0;
  }

  private destroyAllTabs(): void {
    for (const { tab } of this.tabs.values()) {
      tab.destroy();
    }
    this.tabs.clear();
    this.activeAgentId = null;
  }
}
