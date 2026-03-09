import { App, Modal, Notice, PluginSettingTab, Setting, requestUrl } from "obsidian";
import type AgentSidebarPlugin from "./main";
import type { AgentDetectionResult, AgentId, AccessMode, PluginSettings } from "./types";
import { AGENT_ADAPTERS } from "./AgentRunner";
import { SHELL_INJECTION_PATTERN } from "./AgentDetector";
import { PROVIDERS } from "./providers";
import type { ProviderConfig } from "./providers";
import { appendAgentIcon } from "./icons";

export const DEFAULT_SETTINGS: PluginSettings = {
  agents: {
    claude:         { enabled: true,  extraArgs: "", yoloMode: false, accessMode: "cli" },
    codex:          { enabled: true,  extraArgs: "", yoloMode: false, accessMode: "cli" },
    gemini:         { enabled: false, extraArgs: "", yoloMode: false, accessMode: "api" },
    copilot:        { enabled: true,  extraArgs: "", yoloMode: false, accessMode: "cli" },
    "openai-compat": { enabled: false, extraArgs: "", yoloMode: false, accessMode: "api" },
  },
  persistConversations: false,
  debugMode: false,
  workingDirectory: undefined,
};

/** Per-session cache of fetched model lists, keyed by agentId */
const modelListCache: Partial<Record<AgentId, string[]>> = {};

// ─── helpers ──────────────────────────────────────────────────────────────────

function createToggle(
  parent: HTMLElement,
  checked: boolean,
  disabled: boolean,
  onChange: (v: boolean) => void | Promise<void>,
  testId?: string
): HTMLInputElement {
  const label = parent.createEl("label", { cls: "ais-toggle" });
  if (testId) label.dataset.testid = testId;
  const input = label.createEl("input");
  input.type = "checkbox";
  input.checked = checked;
  input.disabled = disabled;
  label.createDiv({ cls: "ais-toggle-track" });
  label.createDiv({ cls: "ais-toggle-thumb" });
  input.addEventListener("change", () => { void onChange(input.checked); });
  return input;
}

// ─── settings tab ─────────────────────────────────────────────────────────────

export class AgentSidebarSettingTab extends PluginSettingTab {
  plugin: AgentSidebarPlugin;
  private detectionResults: AgentDetectionResult[] = [];
  private cardUpdaters = new Map<string, (result: AgentDetectionResult | null) => void>();

  constructor(app: App, plugin: AgentSidebarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("ais-settings");
    new Setting(containerEl).setHeading();

    this.cardUpdaters.clear();
    const cached = this.plugin.agentDetector.getCache();
    this.detectionResults = cached ?? [];

    this.renderProviders(containerEl);
    this.renderGlobal(containerEl);

    if (!cached) {
      this.streamScan();
    }
  }

  private streamScan(rescanBtn?: HTMLButtonElement): void {
    const TIMEOUT_MS = 10_000;

    // Safety net: any card still in checking state after the timeout gets resolved to "not found"
    const timeoutId = setTimeout(() => {
      for (const provider of PROVIDERS) {
        const agentId = provider.agentId;
        if (!this.detectionResults.find((r) => r.id === agentId)) {
          const fallback = { id: agentId, name: provider.label, command: "", path: "", isInstalled: false, hasApiKey: false, apiKeyVar: "" };
          this.detectionResults.push(fallback);
          this.cardUpdaters.get(agentId)?.(fallback);
        }
      }
      if (rescanBtn) { rescanBtn.disabled = false; rescanBtn.textContent = "Re-scan"; }
    }, TIMEOUT_MS);

    void this.plugin.agentDetector.detectStream(AGENT_ADAPTERS, (result) => {
      this.detectionResults = [
        ...this.detectionResults.filter((r) => r.id !== result.id),
        result,
      ];
      this.cardUpdaters.get(result.id)?.(result);
    }).then(() => {
      clearTimeout(timeoutId);
      if (rescanBtn) { rescanBtn.disabled = false; rescanBtn.textContent = "Re-scan"; }
    });
  }

  // ── Providers section ────────────────────────────────────────────────────────

  private renderProviders(root: HTMLElement): void {
    const sectionHeader = root.createDiv({ cls: "ais-section-header" });
    sectionHeader.createEl("span", { text: "Providers", cls: "ais-section-title" });

    const rescanBtn = sectionHeader.createEl("button", { text: "Re-scan", cls: "ais-rescan-btn" });
    rescanBtn.addEventListener("click", () => {
      rescanBtn.disabled = true;
      rescanBtn.textContent = "Scanning…";
      for (const key of PROVIDERS.map(p => p.agentId)) delete modelListCache[key];
      this.plugin.agentDetector.clearCache();
      this.detectionResults = [];
      for (const updater of this.cardUpdaters.values()) updater(null);
      this.streamScan(rescanBtn);
    });

    const list = root.createDiv({ cls: "ais-provider-list" });
    for (const provider of PROVIDERS) {
      this.renderProviderCard(list, provider);
    }
  }

  private renderProviderCard(parent: HTMLElement, provider: ProviderConfig): void {
    const agentId = provider.agentId;
    const card = parent.createDiv({ cls: "ais-card" });
    card.dataset.testid = `ai-agent-settings-section-${provider.id}`;

    const renderContent = (detection: AgentDetectionResult | null) => {
      card.empty();
      card.className = "ais-card";

      const isChecking = detection === null;
      const isInstalled = detection?.isInstalled ?? false;
      const hasApiKey   = detection?.hasApiKey  ?? false;
      const config      = this.plugin.settings.agents[agentId];
      const canEnable   = isInstalled || hasApiKey || Boolean(config.apiKey?.trim()) || provider.apiKeyOptional === true;

      if (!isChecking) {
        let mode = config.accessMode;
        if (mode === "cli" && !provider.cliSupported)       mode = "api";
        if (mode === "api" && !provider.apiSupported)       mode = "cli";
        if (mode === "cli" && !isInstalled && hasApiKey)    mode = "api";
        if (mode === "api" && !hasApiKey    && isInstalled) mode = "cli";
        if (mode !== config.accessMode) { config.accessMode = mode; void this.plugin.saveSettings(); }
      }

      const isEnabled = config.enabled && canEnable;
      if (isEnabled)                    card.addClass("ais-card--enabled");
      if (!isChecking && !canEnable)    card.addClass("ais-card--no-access");

      this.renderCardHeader(card, provider, agentId, detection, isInstalled, hasApiKey, canEnable, isEnabled, isChecking);
      if (!isChecking && canEnable) {
        this.renderCardBody(card, provider, agentId, isInstalled, hasApiKey, config.accessMode, config);
      }
    };

    renderContent(this.detectionResults.find((r) => r.id === agentId) ?? null);
    this.cardUpdaters.set(agentId, renderContent);
  }

  private renderCardHeader(
    card: HTMLElement,
    provider: ProviderConfig,
    agentId: AgentId,
    detection: AgentDetectionResult | null,
    isInstalled: boolean,
    hasApiKey: boolean,
    canEnable: boolean,
    isEnabled: boolean,
    isChecking: boolean,
  ): void {
    const header = card.createDiv({ cls: "ais-card-header" });

    // Icon
    const icon = header.createDiv({ cls: `ais-provider-icon ais-icon--${provider.id}` });
    appendAgentIcon(icon, agentId);

    // Meta (name + dots + agent label)
    const meta = header.createDiv({ cls: "ais-provider-meta" });
    const nameRow = meta.createDiv({ cls: "ais-provider-name" });
    nameRow.createSpan({ text: provider.label });

    const dots = nameRow.createSpan({ cls: "ais-dots" });
    if (provider.cliSupported) {
      const dot = dots.createSpan({
        cls: `ais-dot ${isChecking ? "ais-dot--checking" : isInstalled ? "ais-dot--ok" : "ais-dot--off"}`,
        text: "CLI",
      });
      if (!isChecking) {
        dot.title = isInstalled
          ? `Detected at ${detection?.path ?? ""}`
          : `'${provider.cliCommand}' not found in PATH`;
      }
    }
    if (provider.apiSupported && provider.apiKeyEnvVar) {
      const dot = dots.createSpan({
        cls: `ais-dot ${isChecking ? "ais-dot--checking" : hasApiKey ? "ais-dot--ok" : "ais-dot--off"}`,
        text: "API",
      });
      if (!isChecking) {
        if (hasApiKey) {
          const foundVar = detection?.apiKeyVar ?? provider.apiKeyEnvVar;
          dot.title = `Detected: ${foundVar}. Validity is confirmed on first use.`;
        } else {
          const allVars = [provider.apiKeyEnvVar, ...(provider.fallbackApiKeyEnvVars ?? [])].join(" or ");
          dot.title = `Not detected. Set ${allVars} in your shell profile (.zshrc, .bash_profile)`;
        }
      }
    }

    const agentSuffix = !provider.cliSupported ? " — API only" : !provider.apiSupported ? " — CLI only" : "";
    meta.createDiv({ cls: "ais-provider-agent", text: provider.agentLabel + agentSuffix });

    // Toggle (right side)
    createToggle(
      header,
      isEnabled,
      !canEnable,
      (val) => {
        this.plugin.settings.agents[agentId].enabled = val;
        void this.plugin.saveSettings().then(() => {
          void this.plugin.getAgentSidebarView()?.refreshTabs();
        });
      },
      `ai-agent-enable-toggle-${agentId}`
    );
  }

  private renderCardBody(
    card: HTMLElement,
    provider: ProviderConfig,
    agentId: AgentId,
    isInstalled: boolean,
    hasApiKey: boolean,
    currentMode: AccessMode,
    config: { extraArgs: string; yoloMode: boolean; accessMode: AccessMode; selectedModel?: string; enabled: boolean },
  ): void {
    const body = card.createDiv({ cls: "ais-card-body" });

    // Mode toggle (only when both modes are available)
    if (provider.cliSupported && provider.apiSupported) {
      const modeRow = body.createDiv({ cls: "ais-mode-row" });
      modeRow.dataset.testid = `ai-agent-mode-row-${agentId}`;
      modeRow.createSpan({ cls: "ais-mode-label", text: "Mode" });

      const flip = modeRow.createDiv({ cls: "ais-mode-flip" });
      const cliLabel = flip.createSpan({ cls: `ais-mode-flip-label${currentMode === "cli" ? " ais-mode-flip-label--active" : ""}`, text: "CLI" });

      const switchEl = flip.createEl("label", { cls: "ais-mode-flip-switch" });
      switchEl.dataset.testid = `ai-agent-mode-flip-${agentId}`;
      const checkbox = switchEl.createEl("input");
      checkbox.type = "checkbox";
      checkbox.checked = currentMode === "api";
      checkbox.disabled = !isInstalled && !hasApiKey && !Boolean(this.plugin.settings.agents[agentId].apiKey?.trim());
      switchEl.createSpan({ cls: "ais-mode-flip-track" });

      const apiLabel = flip.createSpan({ cls: `ais-mode-flip-label${currentMode === "api" ? " ais-mode-flip-label--active" : ""}`, text: "API" });

      // Fields container — repopulated in place when mode changes
      const fields = body.createDiv({ cls: "ais-card-fields" });
      this.populateCardFields(fields, provider, agentId, currentMode, config);

      checkbox.addEventListener("change", () => {
        const newMode: AccessMode = checkbox.checked ? "api" : "cli";
        const revert = () => { checkbox.checked = !checkbox.checked; };
        const performSwitch = () => {
          cliLabel.toggleClass("ais-mode-flip-label--active", newMode === "cli");
          apiLabel.toggleClass("ais-mode-flip-label--active", newMode === "api");
          config.accessMode = newMode;
          void this.plugin.saveSettings();
          void this.plugin.getAgentSidebarView()?.refreshTabs();
          fields.empty();
          this.populateCardFields(fields, provider, agentId, newMode, config);
        };
        const hasHistory = this.plugin.getAgentSidebarView()?.hasConversationHistory(agentId) ?? false;
        if (hasHistory) {
          revert();
          new ConfirmModal(
            this.app,
            `Switch to ${newMode.toUpperCase()} mode? The current conversation for ${provider.agentLabel} will be cleared.`,
            () => { checkbox.checked = !checkbox.checked; performSwitch(); }
          ).open();
          return;
        }
        performSwitch();
      });
    } else {
      // Only one mode supported — render fields directly
      this.populateCardFields(body, provider, agentId, currentMode, config);
    }
  }

  private populateCardFields(
    container: HTMLElement,
    provider: ProviderConfig,
    agentId: AgentId,
    mode: AccessMode,
    config: { extraArgs: string; yoloMode: boolean; accessMode: AccessMode; selectedModel?: string; enabled: boolean },
  ): void {
    if (mode === "cli" && provider.cliSupported) {
      const adapter = AGENT_ADAPTERS.find((a) => a.id === agentId);
      if (adapter?.yoloArgs?.length) {
        const yoloRow = container.createDiv({ cls: "ais-yolo-row" });
        const yoloLabel = yoloRow.createEl("label", { cls: "ais-yolo-label" });
        const yoloCheck = yoloLabel.createEl("input");
        yoloCheck.type = "checkbox";
        yoloCheck.className = "ais-yolo-check";
        yoloCheck.checked = config.yoloMode;
        yoloLabel.createSpan({ cls: "ais-yolo-warn", text: "⚠" });
        yoloLabel.createSpan({ text: "YOLO mode" });
        const yoloHint = yoloRow.createSpan({ cls: "ais-yolo-hint", text: adapter.yoloArgs.join(" ") });
        yoloHint.title = "These flags will be prepended to every CLI invocation";
        yoloCheck.addEventListener("change", () => {
          config.yoloMode = yoloCheck.checked;
          void this.plugin.saveSettings().then(() => {
            void this.plugin.getAgentSidebarView()?.refreshTabs();
          });
        });
      }

      const fieldRow = container.createDiv({ cls: "ais-field-row" });
      fieldRow.createEl("label", { cls: "ais-field-label", text: "Extra CLI args" });
      const input = fieldRow.createEl("input", {
        cls: "ais-field-input",
        attr: { type: "text", placeholder: provider.cliArgsPlaceholder ?? "e.g. --flag value", "data-testid": `ai-agent-extra-args-${agentId}` },
      });
      input.value = config.extraArgs;
      input.addEventListener("change", () => {
        if (SHELL_INJECTION_PATTERN.test(input.value)) {
          new Notice("Extra args contain unsafe characters. Remove ; | & ` $( > and try again.");
          input.value = config.extraArgs;
          return;
        }
        config.extraArgs = input.value;
        void this.plugin.saveSettings();
      });
    } else if (mode === "api" && provider.apiSupported) {
      if (agentId === "openai-compat") {
        this.renderOpenAICompatFields(container, agentId);
      } else {
        this.renderModelField(container, agentId, provider.defaultModel);
      }
    }
  }

  private renderOpenAICompatFields(container: HTMLElement, agentId: AgentId): void {
    const config = this.plugin.settings.agents[agentId];

    const urlRow = container.createDiv({ cls: "ais-field-row" });
    urlRow.createEl("label", { cls: "ais-field-label", text: "Base URL" });
    const urlInput = urlRow.createEl("input", {
      cls: "ais-field-input",
      attr: { type: "text", placeholder: "http://localhost:11434/v1", "data-testid": "ai-agent-openai-compat-base-url" },
    });
    urlInput.value = config.openaiCompatBaseUrl ?? "";
    urlInput.addEventListener("change", () => {
      config.openaiCompatBaseUrl = urlInput.value.trim();
      void this.plugin.saveSettings();
    });

    const keyRow = container.createDiv({ cls: "ais-field-row" });
    keyRow.createEl("label", { cls: "ais-field-label", text: "API Key" });
    const keyInput = keyRow.createEl("input", {
      cls: "ais-field-input",
      attr: { type: "password", placeholder: "optional", "data-testid": "ai-agent-openai-compat-api-key" },
    });
    keyInput.value = config.openaiCompatApiKey ?? "";
    keyInput.addEventListener("change", () => {
      config.openaiCompatApiKey = keyInput.value;
      void this.plugin.saveSettings();
    });

    const modelRow = container.createDiv({ cls: "ais-field-row" });
    modelRow.createEl("label", { cls: "ais-field-label", text: "Model" });
    const modelInput = modelRow.createEl("input", {
      cls: "ais-field-input",
      attr: { type: "text", placeholder: "llama3.2", "data-testid": "ai-agent-openai-compat-model" },
    });
    modelInput.value = config.selectedModel ?? "";
    modelInput.addEventListener("change", () => {
      config.selectedModel = modelInput.value.trim() || undefined;
      void this.plugin.saveSettings();
    });
  }

  private renderModelField(body: HTMLElement, agentId: AgentId, defaultModel: string): void {
    const config = this.plugin.settings.agents[agentId];
    const provider = PROVIDERS.find((p) => p.agentId === agentId)!;
    const fieldRow = body.createDiv({ cls: "ais-field-row" });
    fieldRow.dataset.testid = `ai-agent-model-field-${agentId}`;
    fieldRow.createEl("label", { cls: "ais-field-label", text: "Model" });

    const cached = modelListCache[agentId];
    if (cached) {
      this.buildModelSelect(fieldRow, agentId, cached, config.selectedModel ?? provider.defaultModel, defaultModel);
      return;
    }

    const loading = fieldRow.createSpan({ cls: "ais-field-loading", text: "Loading models…" });

    void (async () => {
      let models: string[];
      try {
        const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 10_000));
        models = await Promise.race([this.fetchModels(agentId), timeout]);
        modelListCache[agentId] = models;
      } catch {
        models = this.getDefaultModels(agentId);
        modelListCache[agentId] = models;
        loading.remove();
        fieldRow.createSpan({ cls: "ais-field-warning", text: "Could not fetch models — using defaults" });
        this.buildModelSelect(fieldRow, agentId, models, config.selectedModel ?? provider.defaultModel, defaultModel);
        return;
      }
      loading.remove();
      this.buildModelSelect(fieldRow, agentId, models, config.selectedModel ?? provider.defaultModel, defaultModel);
    })();
  }

  private buildModelSelect(
    parent: HTMLElement,
    agentId: AgentId,
    models: string[],
    currentModel: string,
    defaultModel: string
  ): void {
    const config = this.plugin.settings.agents[agentId];
    const effective = models.includes(currentModel) ? currentModel : defaultModel;
    const wrap = parent.createDiv({ cls: "ais-select-wrap" });
    const sel = wrap.createEl("select", { cls: "ais-field-select" });
    for (const m of models) {
      const opt = sel.createEl("option", { text: m, attr: { value: m } });
      if (m === effective) opt.selected = true;
    }
    sel.addEventListener("change", () => {
      config.selectedModel = sel.value;
      void this.plugin.saveSettings();
    });
  }

  private async fetchModels(agentId: AgentId): Promise<string[]> {
    const detection = this.detectionResults.find((r) => r.id === agentId);
    if (!detection?.hasApiKey || !detection.apiKeyVar) return this.getDefaultModels(agentId);
    const { resolveShellEnv } = await import("./shellEnv");
    const env = await resolveShellEnv();
    const apiKey = env[detection.apiKeyVar];
    if (!apiKey) return this.getDefaultModels(agentId);

    if (agentId === "claude") {
      const r = await requestUrl({
        url: "https://api.anthropic.com/v1/models",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      });
      if (r.status !== 200) return this.getDefaultModels(agentId);
      const d = r.json as { data: { id: string }[] };
      return d.data.map((m) => m.id);
    }
    if (agentId === "codex") {
      const r = await requestUrl({
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (r.status !== 200) return this.getDefaultModels(agentId);
      const d = r.json as { data: { id: string }[] };
      return d.data.map((m) => m.id).filter((id) => id.startsWith("gpt-") || /^o\d/.test(id)).sort();
    }
    if (agentId === "gemini") {
      const r = await requestUrl({
        url: `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      });
      if (r.status !== 200) return this.getDefaultModels(agentId);
      const d = r.json as { models: { name: string; supportedGenerationMethods?: string[] }[] };
      return d.models
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace("models/", ""));
    }
    return this.getDefaultModels(agentId);
  }

  private getDefaultModels(agentId: AgentId): string[] {
    const map: Partial<Record<AgentId, string[]>> = {
      claude:  ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"],
      codex:   ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"],
      gemini:  ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    };
    return map[agentId] ?? [];
  }

  // ── Global options ────────────────────────────────────────────────────────────

  private renderGlobal(root: HTMLElement): void {
    root.createEl("span", { text: "Global options", cls: "ais-section-title ais-section-title--lower" });
    const list = root.createDiv({ cls: "ais-global-list" });

    this.renderGlobalRow(list,
      "Persist conversations",
      "Save and restore chat history across Obsidian restarts",
      this.plugin.settings.persistConversations,
      (v) => { this.plugin.settings.persistConversations = v; void this.plugin.saveSettings(); }
    );
    this.renderGlobalRow(list,
      "Debug mode",
      "Show raw output from CLI agents and API request details in the chat panel",
      this.plugin.settings.debugMode,
      (v) => { this.plugin.settings.debugMode = v; void this.plugin.saveSettings(); }
    );
  }

  private renderGlobalRow(
    parent: HTMLElement,
    name: string,
    desc: string,
    checked: boolean,
    onChange: (v: boolean) => void | Promise<void>
  ): void {
    const row = parent.createDiv({ cls: "ais-global-row" });
    const meta = row.createDiv({ cls: "ais-global-meta" });
    meta.createDiv({ cls: "ais-global-name", text: name });
    meta.createDiv({ cls: "ais-global-desc", text: desc });
    createToggle(row, checked, false, onChange);
  }
}

class ConfirmModal extends Modal {
  private message: string;
  private onConfirm: () => void;

  constructor(app: App, message: string, onConfirm: () => void) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("p", { text: this.message });
    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    btnRow.createEl("button", { text: "Confirm", cls: "mod-cta" }).addEventListener("click", () => {
      this.onConfirm();
      this.close();
    });
    btnRow.createEl("button", { text: "Cancel" }).addEventListener("click", () => {
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
