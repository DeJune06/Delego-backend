import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

export async function waitForHealth(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Service did not become healthy at ${url}`);
}

export function startService(name, relativeDir, env) {
  const cwd = path.join(ROOT, relativeDir);
  const proc = spawn("node", ["dist/src/index.js"], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout?.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });
  proc.stderr?.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  return proc;
}

export function stopService(proc) {
  if (proc && !proc.killed) {
    proc.kill("SIGTERM");
  }
}
