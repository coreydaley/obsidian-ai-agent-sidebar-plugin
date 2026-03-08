/**
 * Factory for writing temporary fake agent scripts.
 *
 * The generated .mjs script:
 *  - Accepts the full prompt via stdin (inputMode: "stdin" adapter pattern)
 *  - Writes the given chunks to stdout in order, with a small delay between each
 *  - Exits 0 on completion
 *
 * Security: chunk content is embedded via JSON.stringify to prevent any
 * JavaScript injection from chunk strings.
 */

import { mkdtempSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Write a fake agent script to a unique temp directory and return its path.
 *
 * @param chunks  Array of strings the script will write to stdout in order.
 * @param delayMs Milliseconds between each chunk (default 5ms).
 */
export function writeFakeScript(chunks: string[], delayMs = 5): string {
  const dir = mkdtempSync(join(tmpdir(), "fake-agent-"));
  const scriptPath = join(dir, "fake-agent.mjs");

  // JSON.stringify ensures chunk content is safely escaped — no injection possible.
  const script = `
const chunks = ${JSON.stringify(chunks)};
const delay = ${delayMs};

async function main() {
  for (const chunk of chunks) {
    process.stdout.write(chunk);
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
  }
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(String(err) + '\\n');
  process.exit(1);
});
`.trim();

  writeFileSync(scriptPath, script, "utf8");
  chmodSync(scriptPath, 0o700);
  return scriptPath;
}

/**
 * Write a fake agent script that outputs some text then hangs indefinitely.
 * Used for testing dispose() behaviour.
 */
export function writeHangingScript(initialChunks: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "fake-agent-hang-"));
  const scriptPath = join(dir, "fake-agent-hang.mjs");

  const script = `
const chunks = ${JSON.stringify(initialChunks)};

async function main() {
  for (const chunk of chunks) {
    process.stdout.write(chunk);
    await new Promise(r => setTimeout(r, 5));
  }
  // Hang indefinitely — wait to be killed
  await new Promise(() => {});
}

main();
`.trim();

  writeFileSync(scriptPath, script, "utf8");
  chmodSync(scriptPath, 0o700);
  return scriptPath;
}
