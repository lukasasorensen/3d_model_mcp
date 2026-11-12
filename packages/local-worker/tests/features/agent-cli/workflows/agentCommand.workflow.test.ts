import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runAgentCommand } from "../../../../src/features/agent-cli/workflows/agentCommand.workflow.js";
void test("connect preserves selected origin/account and never writes credentials into profiles", async () => {
  const root = await mkdtemp(join(tmpdir(), "tf-connect-"));
  let setups = 0;
  const capabilities = {
    home: root,
    entry: "unused",
    signal: new AbortController().signal,
    setup: async (): Promise<void> => {
      setups++;
    },
    authenticate: async (
      _server: string,
      _loopback: boolean,
      account?: string,
    ): Promise<string> => account ?? "owner",
  };
  try {
    await assert.rejects(
      runAgentCommand(
        {
          command: "connect",
          server: "http://example.com",
          allowLoopbackHttp: true,
        },
        capabilities,
      ),
      /INVALID_ORIGIN/,
    );
    assert.equal(setups, 0);
    const result = await runAgentCommand(
      {
        command: "connect",
        server: "http://127.0.0.1:43100",
        allowLoopbackHttp: true,
      },
      capabilities,
    );
    assert.equal(result.connected, true);
    assert.deepEqual(
      JSON.parse(await readFile(join(root, "connection.json"), "utf8")),
      {
        server: "http://127.0.0.1:43100",
        account: "owner",
        allowLoopbackHttp: true,
      },
    );
    await assert.rejects(
      runAgentCommand(
        {
          command: "call",
          server: "https://elsewhere.example",
          allowLoopbackHttp: false,
        },
        capabilities,
      ),
      /CONNECTION_MISMATCH/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
