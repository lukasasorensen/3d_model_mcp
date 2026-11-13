import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const entry = fileURLToPath(
  new URL(
    "../../../plugins/theoryfoundry-local/skills/theoryfoundry-local/scripts/pluginCli.script.mjs",
    import.meta.url,
  ),
);
async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
async function waitFor(file) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = await json(file).catch(() => undefined);
    if (value) return value;
    await delay(20);
  }
  throw new Error("Fixture child did not start.");
}
async function within(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Launcher did not finish cleanup.")),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    // A container without an init can retain exited orphan workers as zombies.
    if (process.platform === "linux") {
      const status = readFileSync(`/proc/${pid}/stat`, "utf8");
      return (
        status.slice(
          status.lastIndexOf(")") + 2,
          status.lastIndexOf(")") + 3,
        ) !== "Z"
      );
    }
    return true;
  } catch {
    return false;
  }
}
async function stopped(pid) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!alive(pid)) return true;
    await delay(10);
  }
  return false;
}
async function fixture(mode, extra = {}) {
  const root = await mkdtemp(join(tmpdir(), "tf-launcher-test-"));
  const bin = join(root, "bin");
  const working = join(root, "workspace");
  const started = join(root, "started.json");
  const cleaned = join(root, "cleaned.json");
  const wrapper = join(root, "wrapper.json");
  const worker = join(root, "worker.mjs");
  await mkdir(bin);
  await mkdir(working);
  await writeFile(
    worker,
    `import {writeFileSync} from 'node:fs';
const version=process.argv.includes('--version');
if(version&&!process.env.HOLD_VERSION){console.log('0.3.1');process.exit(0)}
if(process.env.CHILD_EXIT){
 console.log(JSON.stringify({cwd:process.cwd(),caller:process.env.THEORYFOUNDRY_CALLER_DIRECTORY}));
 console.error('fixture diagnostic');process.exit(Number(process.env.CHILD_EXIT));
}
writeFileSync(${JSON.stringify(started)},JSON.stringify({pid:process.pid}));
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
 if(stopping)return;stopping=true;
 setTimeout(()=>{writeFileSync(${JSON.stringify(cleaned)},JSON.stringify({signal}));process.exit(0)},250);
});
setInterval(()=>{},50);
`,
  );
  await writeFile(
    join(bin, "npx"),
    `#!${process.execPath}
const {spawn}=require('node:child_process');const fs=require('node:fs');
fs.writeFileSync(${JSON.stringify(wrapper)},JSON.stringify({pid:process.pid,args:process.argv.slice(2)}));
const child=spawn(process.execPath,[${JSON.stringify(worker)},...process.argv.slice(2)],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>process.exit(0));
child.on('exit',code=>process.exit(code??1));
`,
    { mode: 0o700 },
  );
  const env = {
    ...process.env,
    ...extra,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
  };
  if (mode === "candidate") env.THEORYFOUNDRY_LOCAL_CLI = worker;
  else delete env.THEORYFOUNDRY_LOCAL_CLI;
  const launcher = spawn(
    process.execPath,
    [entry, "local", "start", "--json"],
    {
      cwd: working,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  launcher.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  launcher.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exited = once(launcher, "exit");
  return {
    root,
    working,
    started,
    cleaned,
    wrapper,
    launcher,
    exited,
    output: () => ({ stdout, stderr }),
    cleanup: async () => {
      // Each PID comes only from this test's disposable scripts.
      for (const file of [started, wrapper]) {
        const value = await json(file).catch(() => undefined);
        if (value && alive(value.pid)) process.kill(value.pid, "SIGKILL");
      }
      if (launcher.exitCode === null && launcher.signalCode === null)
        launcher.kill("SIGKILL");
      await within(exited);
      await rm(root, { recursive: true, force: true });
    },
  };
}
for (const mode of ["candidate", "npx"]) {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    test(
      `actual skill entrypoint forwards ${signal} through ${mode} and awaits worker cleanup`,
      { skip: process.platform === "win32" },
      async () => {
        const f = await fixture(mode);
        try {
          const worker = await waitFor(f.started);
          f.launcher.kill(signal);
          const [code, exitSignal] = await within(f.exited);
          assert.deepEqual(
            await json(f.cleaned).catch(() => undefined),
            { signal },
            "worker cleanup must finish before the launcher exits",
          );
          assert.equal(code, signal === "SIGINT" ? 130 : 143);
          assert.equal(exitSignal, null);
          assert.equal(await stopped(worker.pid), true);
          if (mode === "npx") {
            const wrapper = await json(f.wrapper);
            assert.equal(await stopped(wrapper.pid), true);
            assert.deepEqual(wrapper.args, [
              "--yes",
              "@tfoundry/local-worker@0.3.1",
              "local",
              "start",
              "--json",
            ]);
          }
        } finally {
          await f.cleanup();
        }
      },
    );
  }
}
test("actual skill entrypoint preserves child output, working-directory isolation and failure status", async () => {
  const f = await fixture("candidate", { CHILD_EXIT: "7" });
  try {
    const [code] = await within(f.exited);
    assert.equal(code, 7);
    const { stdout, stderr } = f.output();
    assert.deepEqual(JSON.parse(stdout), {
      cwd: homedir(),
      caller: await realpath(f.working),
    });
    assert.equal(stderr, "fixture diagnostic\n");
  } finally {
    await f.cleanup();
  }
});
test(
  "actual skill entrypoint cancels a pending candidate version check",
  { skip: process.platform === "win32" },
  async () => {
    const f = await fixture("candidate", { HOLD_VERSION: "1" });
    try {
      const worker = await waitFor(f.started);
      f.launcher.kill("SIGTERM");
      const [code] = await within(f.exited);
      assert.deepEqual(await json(f.cleaned).catch(() => undefined), {
        signal: "SIGTERM",
      });
      assert.equal(code, 143);
      assert.equal(await stopped(worker.pid), true);
    } finally {
      await f.cleanup();
    }
  },
);
