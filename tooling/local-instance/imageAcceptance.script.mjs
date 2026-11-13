import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { localProcess } from "../../packages/local-worker/dist/infrastructure/local-instance/index.js";
import { prepareLocalImages } from "../../packages/local-worker/dist/features/local-instance/services/localImages.service.js";

const root = await mkdtemp(join(tmpdir(), "tf-image-acceptance-"));
const id = randomBytes(8).toString("hex");
const name = `tf-image-acceptance-${id}`;
const fixtureImage = `${name}:fixture`;
const docker = localProcess(AbortSignal.timeout(5 * 60 * 1000));
const references = [];
const tags = [];
const command = async (args) => {
  const result = await docker(args);
  assert.equal(result.code, 0, `Docker fixture command failed: ${args[0]}`);
  return result.stdout.toString().trim();
};
try {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  await command([
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--publish",
    `127.0.0.1:${port}:5000`,
    "registry:3",
  ]);
  let available = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    available = await fetch(`http://127.0.0.1:${port}/v2/`)
      .then((response) => response.ok)
      .catch(() => false);
    if (available) break;
    await delay(100);
  }
  assert.equal(available, true);
  await writeFile(
    join(root, "Dockerfile"),
    "FROM scratch\nCOPY marker /marker\n",
  );
  await writeFile(join(root, "marker"), id);
  await command(["build", "--tag", fixtureImage, root]);
  for (const image of ["app", "tooling", "postgres"]) {
    const repository = `localhost:${port}/${name}-${image}`;
    const tag = `${repository}:fixture`;
    tags.push(tag);
    await command(["tag", fixtureImage, tag]);
    await command(["push", tag]);
    const digests = JSON.parse(
      await command([
        "image",
        "inspect",
        tag,
        "--format",
        "{{json .RepoDigests}}",
      ]),
    );
    references.push(
      digests.find((digest) => digest.startsWith(`${repository}@sha256:`)),
    );
    assert.ok(references.at(-1));
    await command(["image", "rm", tag]);
    if ((await docker(["image", "inspect", references.at(-1)])).code === 0)
      await command(["image", "rm", references.at(-1)]);
  }
  for (const reference of references)
    assert.notEqual((await docker(["image", "inspect", reference])).code, 0);
  const calls = [];
  const caps = {
    home: root,
    assets: root,
    signal: AbortSignal.timeout(60000),
    secrets: async () => undefined,
    prompt: async () => "",
    open: async () => undefined,
    run: async (args, options) => {
      calls.push(args);
      return docker(args, options);
    },
  };
  const state = {
    format: 1,
    id,
    port: 43100,
    release: {
      version: "0.8.0",
      workerVersion: "0.3.0",
      postgresMajor: 18,
      appImage: references[0],
      toolingImage: references[1],
      postgresImage: references[2],
    },
  };
  await prepareLocalImages(caps, state);
  assert.equal(calls.filter((args) => args[0] === "pull").length, 3);
  await command(["stop", name]);
  calls.length = 0;
  await prepareLocalImages(caps, state);
  assert.ok(calls.every((args) => args[0] === "image"));
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "three absent digest references pulled from an isolated local registry",
        "cached images reused after registry shutdown",
      ],
      limitations: [
        "Fixture images test Docker transport; public GHCR release delivery is still pending.",
      ],
    }),
  );
} finally {
  const cleanup = localProcess(AbortSignal.timeout(30000));
  await cleanup(["rm", "--force", name]).catch(() => undefined);
  for (const reference of [...tags, ...references, fixtureImage])
    if ((await cleanup(["image", "inspect", reference])).code === 0)
      await cleanup(["image", "rm", reference]);
  await rm(root, { recursive: true, force: true });
}
