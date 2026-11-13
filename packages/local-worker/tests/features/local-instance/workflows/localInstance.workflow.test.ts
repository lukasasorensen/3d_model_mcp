import test from "node:test";
import { createServer, type Server } from "node:http";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  mkdir,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  LocalInstallation,
  LocalInstanceCapabilities,
  ProcessResult,
  LocalSecrets,
} from "../../../../src/domains/local-instance/index.js";
import { runLocalInstance } from "../../../../src/features/local-instance/workflows/localInstance.workflow.js";
import { encryptLocalBackup } from "../../../../src/features/local-instance/services/localBackup.service.js";
const release = {
  version: "0.8.0",
  workerVersion: "0.3.0",
  postgresMajor: 18,
  appImage: "theoryfoundry/local-app:0.8.0",
  toolingImage: "theoryfoundry/local-tooling:0.8.0",
};
async function fixture(): Promise<{
  root: string;
  calls: string[][];
  credentials: Map<string, LocalSecrets>;
  caps: LocalInstanceCapabilities;
}> {
  const root = await mkdtemp(join(tmpdir(), "tf-local-test-"));
  const assets = join(root, "assets");
  await mkdir(assets);
  await writeFile(join(assets, "local-release.json"), JSON.stringify(release));
  const credentials = new Map<string, LocalSecrets>();
  const calls: string[][] = [];
  return {
    root,
    calls,
    credentials,
    caps: {
      assets,
      home: join(root, "home"),
      signal: new AbortController().signal,
      prompt: async () => "a long backup password",
      open: async () => undefined,
      secrets: async (id, value): Promise<LocalSecrets | undefined> => {
        if (value) credentials.set(id, value);
        return credentials.get(id);
      },
      run: async (args): Promise<ProcessResult> => {
        calls.push(args);
        return {
          code: 0,
          stdout:
            args[0] === "run"
              ? Buffer.from("fixture snapshot")
              : Buffer.alloc(0),
        };
      },
    },
  };
}
void test("a missing installation is read-only; locks and existing origins prevent accidental adoption", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(
      await runLocalInstance(
        { command: "status", open: false },
        f.caps,
        "0.3.0",
      ),
      { installed: false, ready: false },
    );
    assert.equal(f.credentials.size, 0);
    assert.equal(f.calls.length, 0);
    await mkdir(join(f.caps.home, "operation.lock"));
    await assert.rejects(
      runLocalInstance({ command: "start", open: false }, f.caps, "0.3.0"),
      /LOCAL_BUSY/,
    );
    assert.equal(f.calls.length, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
void test("restore authenticates a backup before Docker or credential writes and never overwrites an installation", async () => {
  const f = await fixture();
  try {
    const input = join(f.root, "bad.backup");
    await writeFile(input, "invalid");
    await assert.rejects(
      runLocalInstance(
        { command: "restore", open: false, input },
        f.caps,
        "0.3.0",
      ),
      /BACKUP_INVALID/,
    );
    assert.equal(f.calls.length, 0);
    assert.equal(f.credentials.size, 0);
    const state = { format: 1, id: "0123456789abcdef", port: 43100, release };
    const secrets = {
      database: "a".repeat(64),
      auth: "b".repeat(64),
      setup: "c".repeat(64),
      ai: Buffer.alloc(32, 1).toString("base64"),
    };
    await writeFile(
      input,
      encryptLocalBackup(
        Buffer.from(
          JSON.stringify({
            state,
            secrets,
            archive: Buffer.from("snapshot").toString("base64"),
          }),
        ),
        "a long backup password",
      ),
    );
    const result = await runLocalInstance(
      { command: "restore", open: false, input, port: 53241 },
      f.caps,
      "0.3.0",
    );
    assert.equal(result.restored, true);
    const restored = JSON.parse(
      await readFile(join(f.caps.home, "installation.json"), "utf8"),
    ) as { id: string };
    assert.notEqual(restored.id, state.id);
    assert.equal(f.credentials.get(restored.id)?.auth, secrets.auth);
    assert.ok(
      f.calls.some((args) => args.includes("none") && args.includes("-xzf")),
    );
    await assert.rejects(
      runLocalInstance(
        { command: "restore", open: false, input },
        f.caps,
        "0.3.0",
      ),
      /RESTORE_TARGET/,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
void test("failed upgrades retain the cold backup and prevent old-image startup", async () => {
  const f = await fixture();
  try {
    await mkdir(f.caps.home);
    const state = { format: 1, id: "0123456789abcdef", port: 53242, release };
    await writeFile(
      join(f.caps.home, "installation.json"),
      JSON.stringify(state),
    );
    f.credentials.set(state.id, {
      database: "a".repeat(64),
      auth: "b".repeat(64),
      setup: "c".repeat(64),
      ai: Buffer.alloc(32, 1).toString("base64"),
    });
    const manifest = join(f.root, "release.json");
    await writeFile(
      manifest,
      JSON.stringify({
        ...release,
        version: "0.9.0",
        workerVersion: "0.4.0",
        appImage: "theoryfoundry/local-app:0.9.0",
      }),
    );
    const run = f.caps.run;
    f.caps.run = async (args, options): Promise<ProcessResult> =>
      args.includes("up")
        ? { code: 1, stdout: Buffer.alloc(0) }
        : run(args, options);
    const output = join(f.root, "before.backup");
    await assert.rejects(
      runLocalInstance(
        { command: "upgrade", open: false, release: manifest, output },
        f.caps,
        "0.4.0",
      ),
      /COMPOSE_FAILED/,
    );
    assert.ok((await readFile(output)).length > 52);
    const pending = JSON.parse(
      await readFile(join(f.caps.home, "installation.json"), "utf8"),
    ) as { upgradePending: boolean };
    assert.equal(pending.upgradePending, true);
    await assert.rejects(
      runLocalInstance({ command: "start", open: false }, f.caps, "0.4.0"),
      /UPGRADE_PENDING/,
    );
    assert.ok(f.calls.some((args) => args.includes("stop")));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

void test("stopping the local stack does not depend on unlocking the OS credential store", async () => {
  const f = await fixture();
  try {
    await mkdir(f.caps.home);
    await writeFile(
      join(f.caps.home, "installation.json"),
      JSON.stringify({
        format: 1,
        id: "0123456789abcdef",
        port: 53242,
        release,
      }),
    );
    f.caps.secrets = async (): Promise<never> => {
      throw new Error("locked");
    };
    assert.deepEqual(
      await runLocalInstance({ command: "stop", open: false }, f.caps, "0.3.0"),
      { stopped: true, dataPreserved: true },
    );
    assert.ok(f.calls.some((args) => args.at(-1) === "stop"));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

async function listen(server: Server, port = 0): Promise<number> {
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return address.port;
}
async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
async function startupFixture(): Promise<{
  root: string;
  caps: LocalInstanceCapabilities;
  state: LocalInstallation;
  calls: string[][];
  abort: AbortController;
  cleanup(): Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "tf-startup-regression-"));
  const state: LocalInstallation = {
    format: 1,
    id: "0123456789abcdef",
    port: 0,
    journalInitialized: true,
    release: {
      version: "0.8.0",
      workerVersion: "0.3.0",
      postgresMajor: 18,
      appImage: "theoryfoundry/local-app:0.8.0",
      toolingImage: "theoryfoundry/local-tooling:0.8.0",
    },
  };
  let gateway = createServer((_req, res) => {
    res.writeHead(503);
    res.end();
  });
  state.port = await listen(gateway);
  const home = join(root, "home");
  await mkdir(home);
  await writeFile(join(home, "installation.json"), JSON.stringify(state));
  const calls: string[][] = [];
  const secrets = {
    database: "a".repeat(64),
    auth: "b".repeat(64),
    setup: "c".repeat(64),
    ai: Buffer.alloc(32).toString("base64"),
  };
  const abort = new AbortController();
  const caps: LocalInstanceCapabilities = {
    home,
    assets: root,
    signal: abort.signal,
    prompt: async () => "",
    open: async () => undefined,
    secrets: async () => secrets,
    run: async (args, options) => {
      assert.ok(options?.signal);
      options.signal.throwIfAborted();
      calls.push(args);
      if (
        args[0] === "ps" &&
        args.includes("label=com.docker.compose.service=migrate")
      )
        return { code: 0, stdout: Buffer.alloc(0) };
      if (args[0] === "ps")
        return { code: 0, stdout: Buffer.from("container-id\n") };
      if (args[0] === "inspect")
        return {
          code: 0,
          stdout: Buffer.from(
            JSON.stringify({
              labels: {
                "com.docker.compose.project": `theoryfoundry-local-${state.id}`,
                "com.docker.compose.service": "proxy",
              },
              running: true,
              ports: {
                "3000/tcp": [
                  { HostIp: "127.0.0.1", HostPort: String(state.port) },
                ],
              },
            }),
          ),
        };
      if (args.includes("stop") && gateway.listening) await close(gateway);
      if (args.includes("up") && args.at(-1) === "proxy") {
        gateway = createServer((_req, res) => {
          res.writeHead(200, { "x-theoryfoundry-local-instance": state.id });
          res.end();
        });
        await listen(gateway, state.port);
      }
      return { code: 0, stdout: Buffer.alloc(0) };
    },
  };
  return {
    root,
    caps,
    state,
    calls,
    abort,
    cleanup: async (): Promise<void> => {
      if (gateway.listening) await close(gateway);
      await rm(root, { recursive: true, force: true });
    },
  };
}
void test("start repairs its unhealthy occupied origin and preserves installation identity", async () => {
  const f = await startupFixture();
  try {
    assert.equal(
      (
        await runLocalInstance(
          { command: "status", open: false },
          f.caps,
          "0.3.0",
        )
      ).ready,
      false,
    );
    const result = await runLocalInstance(
      { command: "start", open: false },
      f.caps,
      "0.3.0",
    );
    assert.equal(result.ready, true);
    assert.ok(
      f.calls.some(
        (args) =>
          args.includes("stop") &&
          args.includes("proxy") &&
          args.includes("app"),
      ),
    );
    assert.ok(
      f.calls.some((args) => args.includes("run") && args.at(-1) === "migrate"),
    );
    const saved = JSON.parse(
      await readFile(join(f.caps.home, "installation.json"), "utf8"),
    ) as LocalInstallation;
    assert.equal(saved.id, f.state.id);
    assert.equal(saved.port, f.state.port);
    f.calls.length = 0;
    assert.equal(
      (
        await runLocalInstance(
          { command: "start", open: false },
          f.caps,
          "0.3.0",
        )
      ).ready,
      true,
    );
    assert.ok(f.calls.every((args) => args[0] === "image"));
  } finally {
    await f.cleanup();
  }
});
void test("a different installation or an unrelated listener cannot be stopped by recovery", async () => {
  for (const differentContainer of [true, false]) {
    const f = await startupFixture();
    try {
      const run = f.caps.run;
      f.caps.run = async (args, options): Promise<ProcessResult> => {
        if (args[0] === "ps" && !differentContainer)
          return { code: 0, stdout: Buffer.alloc(0) };
        const result = await run(args, options);
        return args[0] === "inspect"
          ? {
              ...result,
              stdout: Buffer.from(
                result.stdout
                  .toString()
                  .replace(f.state.id, "fedcba9876543210"),
              ),
            }
          : result;
      };
      await assert.rejects(
        runLocalInstance({ command: "start", open: false }, f.caps, "0.3.0"),
        /PORT_BUSY/,
      );
      assert.ok(
        !f.calls.some((args) => args.includes("stop") || args.includes("up")),
      );
      assert.equal(
        (await fetch(`http://127.0.0.1:${f.state.port}`)).status,
        503,
      );
    } finally {
      await f.cleanup();
    }
  }
});
void test("cancellation after service launch uses an independent cleanup signal and releases its lock", async () => {
  for (const cleanupFails of [false, true]) {
    const f = await startupFixture();
    let cleaned = false;
    try {
      const run = f.caps.run;
      f.caps.run = async (args, options): Promise<ProcessResult> => {
        if (args.includes("run") && args.at(-1) === "migrate") {
          f.abort.abort();
          throw f.abort.signal.reason;
        }
        if (args.includes("stop") && args.includes("--timeout")) {
          assert.notEqual(options?.signal, f.abort.signal);
          assert.equal(options?.signal?.aborted, false);
          assert.ok(
            f.calls.some(
              (call) => call.includes("up") && call.at(-1) === "postgres",
            ),
          );
          cleaned = true;
          if (cleanupFails) throw new Error("cleanup fixture failure");
        }
        return run(args, options);
      };
      await assert.rejects(
        runLocalInstance({ command: "start", open: false }, f.caps, "0.3.0"),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /LOCAL_CANCELLED/);
          assert.equal(error.message.includes("CLEANUP_PENDING"), cleanupFails);
          assert.equal(error.cause, f.abort.signal.reason);
          return true;
        },
      );
      assert.equal(cleaned, true);
      if (!cleanupFails)
        assert.ok(
          f.calls.some(
            (args) => args[0] === "stop" && args.includes("container-id"),
          ),
        );
      await assert.rejects(stat(join(f.caps.home, "operation.lock")), {
        code: "ENOENT",
      });
    } finally {
      await f.cleanup();
    }
  }
});
