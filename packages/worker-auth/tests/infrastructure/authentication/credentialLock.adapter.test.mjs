import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, symlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createCredentialLock } from "../../../dist/infrastructure/authentication/credentialLock.adapter.js";
test("separate processes exclude rotation and abandoned locks fail closed", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "worker-lock-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const adapter = new URL(
    "../../../dist/infrastructure/authentication/credentialLock.adapter.js",
    import.meta.url,
  ).href;
  const script = `import {createCredentialLock} from ${JSON.stringify(adapter)}; await createCredentialLock(${JSON.stringify(directory)}, 'https://cad.example').run(async () => { console.log('locked'); await new Promise(() => { setInterval(() => {}, 1000); }); });`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGKILL"));
  await new Promise((resolve, reject) => {
    child.stdout.once("data", resolve);
    child.once("error", reject);
    child.once("exit", () => reject(new Error("child exited")));
  });
  await assert.rejects(
    createCredentialLock(directory, "https://cad.example", 100).run(
      async () => {},
    ),
    { code: "CREDENTIAL_LOCKED" },
  );
  child.kill("SIGKILL");
  await new Promise((resolve) => child.once("exit", resolve));
  await assert.rejects(
    createCredentialLock(directory, "https://cad.example", 100).run(
      async () => {},
    ),
    { code: "CREDENTIAL_LOCKED" },
  );
  assert.equal((await readdir(directory)).length, 1);
});
test("lock rejects symlink directory and releases after exceptions/cancellation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "worker-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "real"), { mode: 0o700 });
  await symlink(join(root, "real"), join(root, "linked"), "dir");
  await assert.rejects(
    createCredentialLock(join(root, "linked"), "https://cad.example").run(
      async () => {},
    ),
    { code: "UNSAFE_LOCK_DIRECTORY" },
  );
  const lock = createCredentialLock(join(root, "real"), "https://cad.example");
  await assert.rejects(
    lock.run(async () => {
      throw new Error("failure");
    }),
  );
  assert.equal(await lock.run(async () => "ok"), "ok");
  await assert.rejects(lock.run(async () => {}, AbortSignal.abort()));
  assert.deepEqual(await readdir(join(root, "real")), []);
});
