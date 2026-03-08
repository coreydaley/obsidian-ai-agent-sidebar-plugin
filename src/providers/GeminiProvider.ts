import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import { requestUrl } from "obsidian";
import type { ChatMessage, ProviderAdapter } from "../types";

export class GeminiProvider implements ProviderAdapter {
  private genAI: GoogleGenerativeAI;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async *stream(messages: ChatMessage[], context: string, model: string): AsyncIterable<string> {
    const { vaultPath, activeFileContent } = JSON.parse(context) as {
      vaultPath: string;
      activeFileContent: string | null;
    };

    const systemInstruction = buildSystemPrompt(vaultPath, activeFileContent);

    const genModel = this.genAI.getGenerativeModel({
      model,
      systemInstruction,
    });

    // Gemini requires alternating user/model turns; no system role in messages
    // Ensure alternating: merge consecutive same-role messages if needed
    const contents: Content[] = [];
    for (const msg of messages) {
      const role = msg.role === "assistant" ? "model" : "user";
      const last = contents[contents.length - 1];
      if (last && last.role === role) {
        // Merge with previous same-role message
        (last.parts as { text: string }[])[0].text += "\n" + msg.content;
      } else {
        contents.push({ role, parts: [{ text: msg.content }] });
      }
    }

    // Gemini requires the last message to be from the user
    if (contents.length === 0 || contents[contents.length - 1].role !== "user") {
      return;
    }

    const history = contents.slice(0, -1);
    const lastUserContent = contents[contents.length - 1].parts[0] as { text: string };

    const chat = genModel.startChat({ history });
    const result = await chat.sendMessageStream(lastUserContent.text);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }

  async listModels(): Promise<string[]> {
    const r = await requestUrl({
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`,
    });
    if (r.status !== 200) return [];
    const data = r.json as { models: { name: string; supportedGenerationMethods?: string[] }[] };
    return data.models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace("models/", ""));
  }
}

function buildSystemPrompt(vaultPath: string, activeFileContent: string | null): string {
  const MAX_CONTEXT_BYTES = 8 * 1024;
  const truncated = activeFileContent ? activeFileContent.slice(0, MAX_CONTEXT_BYTES) : null;
  const contextSection = truncated
    ? `\n--- BEGIN VAULT CONTEXT (read-only reference) ---\n${truncated}\n--- END VAULT CONTEXT ---\n`
    : "";

  return (
    `You are an AI assistant integrated into Obsidian via the AI Agent Sidebar plugin.\n` +
    `The user's vault is located at: ${vaultPath}\n` +
    `All file paths you use must be relative to the vault root.\n` +
    contextSection +
    `\nWhen you need to perform file operations on the vault, emit them as structured blocks:\n` +
    `\n:::file-op\n{"op":"read","path":"relative/path.md"}\n:::\n` +
    `\n:::file-op\n{"op":"write","path":"notes/new.md","content":"# Title\\n\\nContent here"}\n:::\n` +
    `\n:::file-op\n{"op":"delete","path":"archive/old.md"}\n:::\n` +
    `\n:::file-op\n{"op":"rename","oldPath":"draft.md","newPath":"final.md"}\n:::\n` +
    `\n:::file-op\n{"op":"list","path":"folder/"}\n:::\n` +
    `\nAfter each file operation block you emit, wait for the result to be injected before continuing.\n` +
    `Only emit file operations when the user explicitly asks you to read, create, edit, rename, or delete files.\n` +
    `If you cannot perform a file operation safely, explain why in plain text instead.\n`
  );
}
