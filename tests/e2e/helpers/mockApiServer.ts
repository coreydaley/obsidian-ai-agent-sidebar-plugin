/**
 * mockApiServer.ts — Lightweight mock HTTP server for E2E testing.
 *
 * Binds to 127.0.0.1 (loopback only) on a random available port.
 * Serves canned SSE responses in Anthropic and OpenAI wire formats so
 * E2E tests can run without real API keys or network access.
 *
 * Mock SSE formats verified against SDK parsing:
 *   - Anthropic: messages stream events (content_block_delta text_delta)
 *   - OpenAI: chat completions stream data chunks ending with [DONE]
 *
 * Usage:
 *   const server = await startMockApiServer({ response: "Hello from mock" });
 *   // inject server.port into Obsidian via extraEnv
 *   server.requestCount("/v1/messages") // → number of POST /v1/messages calls
 *   await server.close();
 */
import * as http from "http";

export interface MockServer {
  port: number;
  setResponse(text: string): void;
  requestCount(path: string): number;
  close(): Promise<void>;
}

function buildAnthropicSse(responseText: string): string {
  const lines: string[] = [];

  lines.push("event: message_start");
  lines.push(
    `data: ${JSON.stringify({ type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", content: [], model: "claude-test", stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 } } })}`
  );
  lines.push("");

  lines.push("event: content_block_start");
  lines.push(`data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}`);
  lines.push("");

  lines.push("event: content_block_delta");
  lines.push(`data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: responseText } })}`);
  lines.push("");

  lines.push("event: content_block_stop");
  lines.push(`data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}`);
  lines.push("");

  lines.push("event: message_delta");
  lines.push(`data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: responseText.length } })}`);
  lines.push("");

  lines.push("event: message_stop");
  lines.push(`data: ${JSON.stringify({ type: "message_stop" })}`);
  lines.push("");

  // Extra trailing newline ensures the last event is properly terminated (\n\n)
  return lines.join("\n") + "\n";
}

function buildOpenAiSse(responseText: string): string {
  const lines: string[] = [];

  lines.push(`data: ${JSON.stringify({ id: "chatcmpl-test", object: "chat.completion.chunk", choices: [{ delta: { role: "assistant", content: responseText }, finish_reason: null, index: 0 }] })}`);
  lines.push("");

  lines.push(`data: ${JSON.stringify({ id: "chatcmpl-test", object: "chat.completion.chunk", choices: [{ delta: {}, finish_reason: "stop", index: 0 }] })}`);
  lines.push("");

  lines.push("data: [DONE]");
  lines.push("");

  // Extra trailing newline ensures the last event is properly terminated (\n\n)
  return lines.join("\n") + "\n";
}

function buildModelsResponse(): string {
  return JSON.stringify({ data: [{ id: "mock-model", object: "model" }], object: "list" });
}

/**
 * Gemini streaming response in SSE format.
 *
 * Spike result: When requestOptions.baseUrl is set, the Google AI SDK constructs
 * the URL as ${baseUrl}/v1beta/${model}:streamGenerateContent?alt=sse
 * (confirmed from SDK source: RequestUrl.toString() appends "?alt=sse" for stream=true)
 *
 * The SDK's responseLineRE = /^data\: (.*)(?:\n\n|\r\r|\r\n\r\n)/ parses SSE lines,
 * so the response body must be SSE (not plain JSON).
 *
 * Verified format: each chunk is `data: {GenerateContentResponse JSON}\n\n`
 */
function buildGeminiSseResponse(responseText: string): string {
  const payload = JSON.stringify({
    candidates: [
      {
        content: { parts: [{ text: responseText }], role: "model" },
        finishReason: "STOP",
      },
    ],
  });
  return `data: ${payload}\n\n`;
}

function buildGeminiModelsResponse(): string {
  return JSON.stringify({
    models: [{ name: "models/gemini-test", supportedGenerationMethods: ["generateContent"] }],
  });
}

// CORS headers required because SDK v0.78+ (Anthropic) and v6+ (OpenAI) use the
// global `fetch` in Electron renderer, which enforces Chromium's CORS policy.
// Real production APIs return these headers; the mock must too.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

export async function startMockApiServer(opts: { response?: string } = {}): Promise<MockServer> {
  let cannedResponse = opts.response ?? "Hello from mock";
  const counts: Record<string, number> = {};

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";

    // Handle CORS preflight — do not increment request counts for OPTIONS
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    counts[url] = (counts[url] ?? 0) + 1;

    // Consume request body (don't hang the connection)
    req.resume();
    req.on("end", () => {
      if (req.method === "POST" && url === "/v1/messages") {
        // Anthropic messages API
        res.writeHead(200, {
          ...CORS_HEADERS,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.end(buildAnthropicSse(cannedResponse));
      } else if (req.method === "POST" && url === "/v1/chat/completions") {
        // OpenAI chat completions API
        res.writeHead(200, {
          ...CORS_HEADERS,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.end(buildOpenAiSse(cannedResponse));
      } else if (req.method === "GET" && (url === "/v1/models" || url.startsWith("/v1/models?"))) {
        // Models list (Anthropic + OpenAI)
        res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json" });
        res.end(buildModelsResponse());
      } else if (req.method === "POST" && url.startsWith("/v1beta/models/")) {
        // Gemini streamGenerateContent — path: /v1beta/models/{model}:streamGenerateContent?alt=sse
        res.writeHead(200, {
          ...CORS_HEADERS,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.end(buildGeminiSseResponse(cannedResponse));
      } else if (req.method === "GET" && (url === "/v1beta/models" || url.startsWith("/v1beta/models?"))) {
        // Gemini models list
        res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json" });
        res.end(buildGeminiModelsResponse());
      } else {
        res.writeHead(404, CORS_HEADERS);
        res.end("Not found");
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const addr = server.address() as { port: number };

  return {
    port: addr.port,
    setResponse(text: string) { cannedResponse = text; },
    requestCount(path: string) { return counts[path] ?? 0; },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
