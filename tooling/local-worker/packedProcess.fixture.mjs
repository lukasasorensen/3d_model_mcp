import { spawn } from "node:child_process";
export function runPacked(args, options, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["--silent", "dlx", options.specifier, ...args],
      {
        cwd: options.cwd,
        env: options.env,
        stdio: ["pipe", "pipe", "pipe"],
        signal: AbortSignal.timeout(600_000),
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += String(data);
    });
    child.stderr.on("data", (data) => {
      stderr += String(data);
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
    if (input) input(child, () => stdout);
    else child.stdin.end();
  });
}
export function initializeStdio(child, output) {
  child.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "packed-artifact-test", version: "1" },
      },
    }) + "\n",
  );
  let listed = false;
  child.stdout.on("data", () => {
    const lines = output()
      .trim()
      .split("\n")
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return {};
        }
      });
    if (!listed && lines.some((line) => line.id === 1)) {
      listed = true;
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }) + "\n",
      );
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n",
      );
    }
    if (lines.some((line) => line.id === 2)) child.stdin.end();
  });
}
