import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { publishedRelease } from "./releaseManifest.util.mjs";

if (process.env.LOCAL_EDITION_DISTRIBUTION_CLEARED !== "true")
  throw new Error(
    "Distribution clearance is required before publishing local images. See THE-15.",
  );
const root = fileURLToPath(new URL("../../", import.meta.url));
const application = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const worker = JSON.parse(
  await readFile(join(root, "packages/local-worker/package.json"), "utf8"),
);
if (
  execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
  }).trim()
)
  throw new Error(
    "Publish local images only from a clean, reviewed source commit.",
  );
const output = join(root, "dist/local-edition");
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), "tf-image-release-"));
const docker = (args, options = {}) =>
  execFileSync("docker", args, { cwd: root, stdio: "inherit", ...options });
try {
  const references = {};
  for (const [target, key, repository] of [
    ["runtime", "appImage", "ghcr.io/lukasasorensen/theoryfoundry-local-app"],
    [
      "tooling",
      "toolingImage",
      "ghcr.io/lukasasorensen/theoryfoundry-local-tooling",
    ],
  ]) {
    const metadata = join(temporary, `${target}.json`);
    docker([
      "buildx",
      "build",
      "--platform",
      "linux/arm64",
      "--target",
      target,
      "--label",
      "org.opencontainers.image.source=https://github.com/lukasasorensen/3d_model_mcp",
      "--tag",
      `${repository}:${application.version}`,
      "--metadata-file",
      metadata,
      "--push",
      root,
    ]);
    const digest = JSON.parse(await readFile(metadata, "utf8"))[
      "containerimage.digest"
    ];
    if (!/^sha256:[a-f0-9]{64}$/.test(digest))
      throw new Error("Missing published image digest.");
    references[key] = `${repository}@${digest}`;
  }
  docker(["pull", "--platform", "linux/arm64", "postgres:18.6-bookworm"]);
  const postgres = JSON.parse(
    docker(
      [
        "image",
        "inspect",
        "postgres:18.6-bookworm",
        "--format",
        "{{json .RepoDigests}}",
      ],
      { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" },
    ),
  );
  const manifest = publishedRelease(
    {
      version: application.version,
      workerVersion: worker.version,
      postgresMajor: 18,
      ...references,
      postgresImage: postgres.find((image) =>
        image.startsWith("postgres@sha256:"),
      ),
    },
    application.version,
    worker.version,
  );
  const anonymous = join(temporary, "anonymous-docker");
  await mkdir(anonymous);
  await writeFile(join(anonymous, "config.json"), "{}");
  // New GHCR packages are private by default; fail until their owner enables public reads.
  for (const image of [
    manifest.appImage,
    manifest.toolingImage,
    manifest.postgresImage,
  ])
    docker(["--config", anonymous, "pull", "--platform", "linux/arm64", image]);
  await writeFile(
    join(output, "local-release.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
