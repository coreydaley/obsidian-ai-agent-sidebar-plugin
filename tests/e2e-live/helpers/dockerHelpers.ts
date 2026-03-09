import * as http from "http";
import { execSync } from "child_process";

// All inputs to execSync are trusted constants — never pass user-controlled values
export const OLLAMA_CONTAINER_NAME = "obsidian-e2e-ollama";
export const OLLAMA_VOLUME_NAME = "obsidian-e2e-ollama-models";
export const OLLAMA_PORT = 11434;
export const OLLAMA_MODEL = "qwen2.5:1.5b";
export const OLLAMA_BASE_URL = `http://127.0.0.1:${OLLAMA_PORT}/v1`;
export const OLLAMA_IMAGE = "ollama/ollama:0.6.5";

export function isDockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function isPortInUse(port: number): boolean {
  try {
    const result = execSync(`lsof -i tcp:${port} -sTCP:LISTEN -t`, { stdio: "pipe" });
    return result.toString().trim().length > 0;
  } catch {
    return false;
  }
}

export async function startOllamaContainer(): Promise<void> {
  execSync(`docker rm -f ${OLLAMA_CONTAINER_NAME}`, { stdio: "ignore" });
  // Mount a named volume for /root/.ollama so pulled models persist across runs.
  // The volume is created automatically by Docker if it doesn't exist.
  execSync(
    `docker run -d --name ${OLLAMA_CONTAINER_NAME} -p 127.0.0.1:${OLLAMA_PORT}:${OLLAMA_PORT} -v ${OLLAMA_VOLUME_NAME}:/root/.ollama ${OLLAMA_IMAGE}`,
    { stdio: "pipe" }
  );

  // Poll for HTTP listener to bind (up to 30 s) rather than fixed sleep
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const ready = await new Promise<boolean>((resolve) => {
      const req = http.get(`http://127.0.0.1:${OLLAMA_PORT}/`, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(1_000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ready) return;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`Ollama HTTP listener did not bind on port ${OLLAMA_PORT} within 30s.`);
}

export async function pullOllamaModel(): Promise<void> {
  // Skip pull if the model is already present in the volume from a previous run.
  try {
    const list = execSync(`docker exec ${OLLAMA_CONTAINER_NAME} ollama list`, { stdio: "pipe" });
    if (list.toString().includes(OLLAMA_MODEL)) return;
  } catch {
    // If `ollama list` fails for any reason, fall through to pull.
  }
  execSync(`docker exec ${OLLAMA_CONTAINER_NAME} ollama pull ${OLLAMA_MODEL}`, {
    timeout: 300_000,
    stdio: "inherit",
  });
}

export async function waitForOllamaReady(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await new Promise<boolean>((resolve) => {
      const req = http.get(`http://127.0.0.1:${OLLAMA_PORT}/v1/models`, (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body) as { data: Array<{ id: string }> };
            resolve(parsed.data?.some((m) => m.id === OLLAMA_MODEL) ?? false);
          } catch {
            resolve(false);
          }
        });
      });
      req.on("error", () => resolve(false));
      req.setTimeout(2_000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (found) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(
    `Ollama not ready after ${timeoutMs}ms. Model ${OLLAMA_MODEL} did not appear in /v1/models.`
  );
}

export async function warmUpOllamaInference(): Promise<void> {
  const body = JSON.stringify({
    model: OLLAMA_MODEL,
    messages: [{ role: "user", content: "hi" }],
    stream: false,
    max_tokens: 5,
  });

  await new Promise<void>((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: OLLAMA_PORT,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk: Buffer) => { responseBody += chunk.toString(); });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`warmUpOllamaInference: unexpected status ${res.statusCode}. Body: ${responseBody}`));
            return;
          }
          try {
            const parsed = JSON.parse(responseBody) as { choices: Array<{ message: { content: string } }> };
            if (!parsed.choices?.[0]?.message?.content) {
              reject(new Error(`warmUpOllamaInference: unexpected response body: ${responseBody}`));
              return;
            }
            resolve();
          } catch {
            reject(new Error(`warmUpOllamaInference: failed to parse response: ${responseBody}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(60_000, () => {
      req.destroy();
      reject(new Error("warmUpOllamaInference: request timed out after 60s"));
    });
    req.write(body);
    req.end();
  });
}

export async function stopOllamaContainer(): Promise<void> {
  try {
    execSync(`docker stop ${OLLAMA_CONTAINER_NAME}`, { stdio: "ignore" });
  } catch {
    // ignore — container may already be stopped
  }
  try {
    execSync(`docker rm ${OLLAMA_CONTAINER_NAME}`, { stdio: "ignore" });
  } catch {
    // ignore — container may already be removed
  }
}
