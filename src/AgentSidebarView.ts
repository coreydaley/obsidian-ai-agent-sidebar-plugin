import { ItemView, WorkspaceLeaf } from "obsidian";
import { AGENT_ICONS } from "./icons";
import { AgentChatTab } from "./AgentChatTab";
import { AgentRunner, AGENT_ADAPTERS } from "./AgentRunner";
import { FileOperationsHandler } from "./FileOperationsHandler";
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
    return "AI Agent Sidebar";
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

  async onClose(): Promise<void> {
    this.destroyAllTabs();
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
      this.addAgentTab(detection);
    }

    // Activate first tab
    if (enabledAgents.length > 0) {
      this.activateTab(enabledAgents[0].id);
    }
  }

  private getEnabledAgents(detectionResults: AgentDetectionResult[]): AgentDetectionResult[] {
    return AGENT_ADAPTERS
      .map((adapter) => detectionResults.find((r) => r.id === adapter.id))
      .filter((r): r is AgentDetectionResult => {
        if (!r) return false;
        const config = this.plugin.settings.agents[r.id];
        return config.enabled && r.isInstalled;
      });
  }

  private addAgentTab(detection: AgentDetectionResult): void {
    const tabBtn = this.tabBar.createEl("button", { cls: "ai-sidebar-tab-btn" });
    tabBtn.title = detection.name;
    tabBtn.innerHTML = AGENT_ICONS[detection.id] ?? "";
    tabBtn.addEventListener("click", () => this.activateTab(detection.id));

    // Chat pane container
    const paneEl = this.chatContainer.createDiv({ cls: "ai-sidebar-pane" });
    paneEl.style.display = "none";

    const adapter = AGENT_ADAPTERS.find((a) => a.id === detection.id)!;
    const config = this.plugin.settings.agents[detection.id];
    const extraArgs = config.extraArgs
      ? config.extraArgs
          .split(/\s+/)
          .filter((s) => s.length > 0)
      : [];

    const runner = new AgentRunner(adapter, detection.path, extraArgs, this.fileOpsHandler);
    const chatTab = new AgentChatTab(paneEl, runner, detection, this.app, this.plugin);

    this.tabs.set(detection.id, { tab: chatTab, btn: tabBtn });
  }

  private activateTab(agentId: string): void {
    // Deactivate current
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
      text: "Open Settings → AI Agent Sidebar to install and enable agents.",
      cls: "ai-sidebar-empty-hint",
    });
  }

  async refreshTabs(): Promise<void> {
    await this.buildTabs();
  }

  private destroyAllTabs(): void {
    for (const { tab } of this.tabs.values()) {
      tab.destroy();
    }
    this.tabs.clear();
    this.activeAgentId = null;
  }
}
