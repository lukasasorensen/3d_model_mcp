import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
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
    assert.equal(f.calls.at(-1)?.at(-1), "stop");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
