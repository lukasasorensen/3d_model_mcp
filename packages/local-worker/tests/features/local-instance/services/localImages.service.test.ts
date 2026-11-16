import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  LocalInstallation,
  LocalInstanceCapabilities,
  ProcessResult,
} from "../../../../src/domains/local-instance/index.js";
import { prepareLocalImages } from "../../../../src/features/local-instance/services/localImages.service.js";
import {
  localInstallationSchema,
  localEnvironment,
} from "../../../../src/features/local-instance/utils/localConfiguration.util.js";

const state: LocalInstallation = {
  format: 1,
  id: "0123456789abcdef",
  port: 43100,
  release: {
    version: "0.8.0",
    workerVersion: "0.3.0",
    postgresMajor: 18,
    appImage: `ghcr.io/lukasasorensen/theoryfoundry-local-app@sha256:${"a".repeat(64)}`,
    toolingImage: `ghcr.io/lukasasorensen/theoryfoundry-local-tooling@sha256:${"b".repeat(64)}`,
    postgresImage: `postgres@sha256:${"c".repeat(64)}`,
  },
};
function fixture(): {
  caps: LocalInstanceCapabilities;
  images: Set<string>;
  calls: string[][];
} {
  const images = new Set<string>();
  const calls: string[][] = [];
  return {
    images,
    calls,
    caps: {
      home: "unused",
      assets: "unused",
      signal: new AbortController().signal,
      secrets: async () => undefined,
      prompt: async () => "",
      open: async () => undefined,
      run: async (args, options): Promise<ProcessResult> => {
        assert.equal(options?.signal?.aborted, false);
        calls.push(args);
        if (args[0] === "pull") images.add(args[1]!);
        if (args[0] === "build") images.add(args[args.indexOf("--tag") + 1]!);
        return {
          code: args[0] !== "image" || images.has(args.at(-1)!) ? 0 : 1,
          stdout: Buffer.alloc(0),
        };
      },
    },
  };
}
void test("cold startup obtains every pinned image; cached startup stays offline", async () => {
  const f = fixture();
  await prepareLocalImages(f.caps, state);
  assert.deepEqual(
    f.calls.filter((args) => args[0] === "pull").map((args) => args[1]),
    [
      state.release.appImage,
      state.release.toolingImage,
      state.release.postgresImage,
    ],
  );
  f.calls.length = 0;
  await prepareLocalImages(f.caps, state);
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every((args) => args[0] === "image"));
});
void test("failed pulls and absent post-pull images fail without lifecycle mutations", async () => {
  for (const pullCode of [0, 1]) {
    const f = fixture();
    f.caps.run = async (args): Promise<ProcessResult> => {
      f.calls.push(args);
      return {
        code: args[0] === "pull" ? pullCode : 1,
        stdout: Buffer.alloc(0),
      };
    };
    await assert.rejects(
      prepareLocalImages(f.caps, state),
      pullCode ? /IMAGE_PULL_FAILED/ : /IMAGE_UNAVAILABLE/,
    );
    assert.ok(f.calls.every((args) => ["image", "pull"].includes(args[0]!)));
  }
});
void test("source builds use local tags, preserve published pins and survive legacy state parsing", async () => {
  const f = fixture();
  const directory = await mkdtemp(join(tmpdir(), "tf-image-source-"));
  try {
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ version: "0.8.0" }),
    );
    const localImages = await prepareLocalImages(f.caps, state, directory);
    assert.equal(localImages?.appImage, "theoryfoundry/local-app:0.8.0");
    assert.ok(
      f.calls
        .filter((args) => args[0] === "build")
        .every((args) => !args.includes(state.release.appImage)),
    );
    const restored = localInstallationSchema.parse({ ...state, localImages });
    assert.equal(restored.release.appImage, state.release.appImage);
    const legacy = localInstallationSchema.parse({
      ...state,
      release: { ...state.release, postgresImage: undefined },
    });
    assert.equal(
      localEnvironment(legacy, { database: "", auth: "", setup: "", ai: "" })
        .TF_LOCAL_POSTGRES_IMAGE,
      "postgres:18.6-bookworm",
    );
    f.calls.length = 0;
    await prepareLocalImages(f.caps, restored);
    assert.equal(
      f.calls.filter((args) => args[0] === "build" || args[0] === "pull")
        .length,
      0,
    );
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ version: "0.9.0" }),
    );
    await assert.rejects(
      prepareLocalImages(f.caps, state, directory),
      /SOURCE_VERSION/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
void test("unpublished development images require an explicit build or archive", async () => {
  const f = fixture();
  await assert.rejects(
    prepareLocalImages(f.caps, {
      ...state,
      release: { ...state.release, appImage: "theoryfoundry/local-app:0.8.0" },
    }),
    /IMAGES_REQUIRED/,
  );
  assert.equal(f.calls.length, 1);
});
