import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { localProcess } from "../../../src/infrastructure/local-instance/localProcess.adapter.js";

void test("Docker cancellation waits for process exit and permits cleanup with a fresh signal", async () => {
  const root = await mkdtemp(join(tmpdir(), "tf-process-test-"));
  const marker = join(root, "started");
  const exited = join(root, "exited");
  try {
    await writeFile(
      join(root, "docker"),
      `#!${process.execPath}
const fs=require('node:fs');
if(process.argv.includes('wait')){
  fs.writeFileSync(${JSON.stringify(marker)}, 'started');
  setInterval(()=>{}, 20);
  process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync(${JSON.stringify(exited)}, 'exited');process.exit(0)}, 100));
}else if(process.argv.includes('context'))process.stdout.write(JSON.stringify('unix:///test.sock'));
else process.stdout.write('stopped');
`,
      { mode: 0o700 },
    );
    const abort = new AbortController();
    const run = localProcess(abort.signal, {
      PATH: `${root}:${process.env.PATH ?? ""}`,
    });
    const waiting = run(["wait"]);
    const rejected = assert.rejects(
      waiting,
      (error: unknown) => error === abort.signal.reason,
    );
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await readFile(marker).catch(() => undefined)) break;
      await delay(10);
    }
    assert.ok(await readFile(marker));
    abort.abort();
    await rejected;
    assert.equal((await readFile(exited)).toString(), "exited");
    const stopped = await run(["stop"], { signal: AbortSignal.timeout(2000) });
    assert.equal(stopped.stdout.toString(), "stopped");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
void test("an aborted Docker context lookup is retried by a later cleanup operation", async () => {
  const root = await mkdtemp(join(tmpdir(), "tf-context-test-"));
  const marker = join(root, "lookup");
  try {
    await writeFile(
      join(root, "docker"),
      `#!${process.execPath}
const fs=require('node:fs');
if(process.argv.includes('context')){
 if(!fs.existsSync(${JSON.stringify(marker)})){fs.writeFileSync(${JSON.stringify(marker)}, 'started');setInterval(()=>{}, 20)}
 else process.stdout.write(JSON.stringify('unix:///test.sock'));
}else process.stdout.write('stopped');
`,
      { mode: 0o700 },
    );
    const abort = new AbortController();
    const run = localProcess(abort.signal, {
      PATH: `${root}:${process.env.PATH ?? ""}`,
    });
    const rejected = assert.rejects(
      run(["wait"]),
      (error: unknown) => error === abort.signal.reason,
    );
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await readFile(marker).catch(() => undefined)) break;
      await delay(10);
    }
    assert.ok(await readFile(marker));
    abort.abort();
    await rejected;
    assert.equal(
      (await run(["stop"], { signal: AbortSignal.timeout(2000) })).code,
      0,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
