import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
for (const ending of ["EOF", "SIGINT", "SIGTERM"] as const)
  void test(
    `stdio starts offline outside the repository and closes on ${ending}`,
    { timeout: 15_000 },
    async (context) => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(
            new URL("../dist/stdioServer.composition.js", import.meta.url),
          ),
          "--server",
          "https://cad.example",
          "--account",
          "fixture-never-used",
        ],
        {
          cwd: tmpdir(),
          signal: context.signal,
          env: { PATH: process.env.PATH, HOME: process.env.HOME },
          stdio: ["pipe", "pipe", "pipe"],
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
      const exited = new Promise<number | null>((resolve, reject) => {
        child.once("exit", resolve);
        child.once("error", reject);
      });
      try {
        const received = new Promise<void>((resolve) => {
          child.stdout.on("data", () => {
            if (stdout.includes('"id":1')) resolve();
          });
        });
        child.stdin.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-11-25",
              capabilities: {},
              clientInfo: { name: "fixture", version: "1" },
            },
          }) + "\n",
        );
        await Promise.race([
          received,
          exited.then(() => {
            throw new Error("Worker exited before initialization.");
          }),
        ]);
        if (ending === "EOF") child.stdin.end();
        else child.kill(ending);
        assert.equal(await exited, 0);
        const lines = stdout
          .trim()
          .split("\n")
          .map(
            (line) =>
              JSON.parse(line) as { result: { serverInfo: { name: string } } },
          );
        assert.equal(lines.length, 1);
        assert.equal(
          lines[0]!.result.serverInfo.name,
          "theoryfoundry-local-worker",
        );
        assert.equal(stderr, "");
      } finally {
        if (child.exitCode === null) child.kill("SIGKILL");
      }
    },
  );
