import type { Content } from "@google/generative-ai";
import { requestUrl } from "obsidian";
import type { ChatMessage, ProviderAdapter } from "../types";

export class GeminiProvider implements ProviderAdapter {
  private apiKey: string;
  private baseURL?: string;

  constructor(apiKey: string, baseURL?: string) {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
  }

  /**
   * Stream a Gemini chat response using a direct fetch call.
   *
   * The Google AI SDK's streaming path uses response.body.pipeThrough(TextDecoderStream)
   * and ReadableStream.tee() which do not yield data in Obsidian's Electron renderer
   * (the stream closes immediately with zero chunks). Using fetch + response.text() with
   * manual SSE parsing bypasses this limitation while preserving the same wire format.
   */
  async *stream(messages: ChatMessage[], context: string, model: string): AsyncIterable<string> {
    const { vaultPath, activeFileContent } = JSON.parse(context) as {
      vaultPath: string;
      activeFileContent: string | null;
    };

    const systemInstruction = buildSystemPrompt(vaultPath, activeFileContent);
    const contents = mergeGeminiMessages(messages);

    // Gemini requires the last message to be from the user
    if (contents.length === 0 || contents[contents.length - 1].role !== "user") {
      return;
    }

    const baseUrl = (this.baseURL ?? "https://generativelanguage.googleapis.com").replace(/\/$/, "");
    const url = `${baseUrl}/v1beta/models/${model}:streamGenerateContent?alt=sse`;

    // Use Obsidian's requestUrl (guaranteed to work in the plugin context) rather than
    // native fetch, which has issues with streaming response bodies in Electron's renderer.
    const r = await requestUrl({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        system_instruction: { role: "system", parts: [{ text: systemInstruction }] },
        contents,
      }),
      throw: false,
    });

    if (r.status !== 200) {
      throw new Error(`Gemini API error: ${r.status}`);
    }

    // r.text is the full SSE response body (requestUrl reads the complete response)
    const text = r.text;

    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json) continue;
      try {
        const data = JSON.parse(json) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) yield candidateText;
      } catch {
        // Skip malformed SSE chunks
      }
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

export function mergeGeminiMessages(messages: ChatMessage[]): Content[] {
  const contents: Content[] = [];
  for (const msg of messages) {
    const role = msg.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      (last.parts as { text: string }[])[0].text += "\n" + msg.content;
    } else {
      contents.push({ role, parts: [{ text: msg.content }] });
    }
  }
  return contents;
}

export function buildSystemPrompt(vaultPath: string, activeFileContent: string | null): string {
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
