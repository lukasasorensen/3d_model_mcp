import { execFileSync } from "node:child_process";
import { mkdir, readFile, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(
  await readFile(
    join(root, "packages/local-worker/dist/local/local-release.json"),
    "utf8",
  ),
);
if (
  manifest.version !==
  JSON.parse(await readFile(join(root, "package.json"), "utf8")).version
)
  throw new Error("Rebuild local assets before packaging images.");
for (const [target, image] of [
  ["runtime", manifest.appImage],
  ["tooling", manifest.toolingImage],
])
  execFileSync("docker", ["build", "--target", target, "--tag", image, root], {
    stdio: "inherit",
  });
execFileSync("docker", ["pull", "postgres:18.6-bookworm"], {
  stdio: "inherit",
});
const output = join(root, "dist/local-edition");
await mkdir(output, { recursive: true });
execFileSync(
  "docker",
  [
    "save",
    "--output",
    join(output, `images-${manifest.version}.tar`),
    manifest.appImage,
    manifest.toolingImage,
    "postgres:18.6-bookworm",
  ],
  { stdio: "inherit" },
);
await cp(
  join(root, "packages/local-worker/dist/local/local-release.json"),
  join(output, "local-release.json"),
);
