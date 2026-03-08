import OpenAI from "openai";
import type { ChatMessage, ProviderAdapter } from "../types";

export class OpenAIProvider implements ProviderAdapter {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  }

  async *stream(messages: ChatMessage[], context: string, model: string): AsyncIterable<string> {
    const { vaultPath, activeFileContent } = JSON.parse(context) as {
      vaultPath: string;
      activeFileContent: string | null;
    };

    const systemPrompt = buildSystemPrompt(vaultPath, activeFileContent);

    const openAIMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      })),
    ];

    const completion = await this.client.chat.completions.create({
      model,
      messages: openAIMessages,
      stream: true,
    });

    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  async listModels(): Promise<string[]> {
    const resp = await this.client.models.list();
    return resp.data
      .map((m) => m.id)
      .filter((id) => id.startsWith("gpt-") || /^o\d/.test(id))
      .sort();
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
