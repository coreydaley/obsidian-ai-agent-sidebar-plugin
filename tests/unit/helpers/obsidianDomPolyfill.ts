/**
 * Polyfills Obsidian's HTMLElement extension methods for JSDOM unit tests.
 *
 * Obsidian extends HTMLElement with convenience DOM helpers that are not part
 * of the standard DOM spec. This file installs those methods on
 * HTMLElement.prototype so AgentChatTab (and other plugin UI components) can
 * be instantiated and exercised in a JSDOM environment without Obsidian.
 *
 * Known differences from real Obsidian:
 * - createEl only applies cls, text, and attr options (the fields used by
 *   AgentChatTab). Other DomElementInfo fields (type, prepend, etc.) are
 *   silently ignored.
 * - normalizePath and other Obsidian utilities are NOT polyfilled here; those
 *   are covered by the obsidianStub.ts module alias.
 * - Prototype mutations are scoped to this JSDOM process; they do not affect
 *   integration or e2e test environments.
 */

interface DomElementInfo {
  cls?: string;
  text?: string;
  attr?: Record<string, string | number | boolean>;
}

type WithObsidian = HTMLElement & {
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    opts?: DomElementInfo
  ): HTMLElementTagNameMap[K];
};

Object.defineProperties(HTMLElement.prototype, {
  empty: {
    value(this: HTMLElement) {
      this.innerHTML = "";
    },
    configurable: true,
    writable: true,
  },
  addClass: {
    value(this: HTMLElement, cls: string) {
      if (cls) this.classList.add(cls);
    },
    configurable: true,
    writable: true,
  },
  removeClass: {
    value(this: HTMLElement, cls: string) {
      if (cls) this.classList.remove(cls);
    },
    configurable: true,
    writable: true,
  },
  createEl: {
    value<K extends keyof HTMLElementTagNameMap>(
      this: HTMLElement,
      tag: K,
      opts?: DomElementInfo
    ): HTMLElementTagNameMap[K] {
      const el = document.createElement(tag);
      if (opts?.cls) el.className = opts.cls;
      if (opts?.text != null) el.textContent = String(opts.text);
      if (opts?.attr) {
        for (const [k, v] of Object.entries(opts.attr)) {
          el.setAttribute(k, String(v));
        }
      }
      this.appendChild(el);
      return el;
    },
    configurable: true,
    writable: true,
  },
  createDiv: {
    value(this: HTMLElement, opts?: DomElementInfo): HTMLDivElement {
      return (this as WithObsidian).createEl("div", opts);
    },
    configurable: true,
    writable: true,
  },
  createSpan: {
    value(this: HTMLElement, opts?: DomElementInfo): HTMLSpanElement {
      return (this as WithObsidian).createEl("span", opts);
    },
    configurable: true,
    writable: true,
  },
});

// crypto.randomUUID() is available in Node 15+ and modern JSDOM, but guard
// against environments where it might be absent.
if (typeof globalThis.crypto?.randomUUID !== "function") {
  let _seq = 0;
  Object.defineProperty(globalThis, "crypto", {
    value: {
      ...globalThis.crypto,
      randomUUID: () => `test-uuid-${_seq++}`,
    },
    configurable: true,
  });
}
