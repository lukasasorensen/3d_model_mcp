import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
const root = fileURLToPath(new URL("../../", import.meta.url));
const source = join(root, "plugins/theoryfoundry-local");
const manifest = JSON.parse(
  await readFile(join(source, "plugin.json"), "utf8"),
);
const application = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const worker = JSON.parse(
  await readFile(join(root, "packages/local-worker/package.json"), "utf8"),
);
const runtime = JSON.parse(
  await readFile(join(source, "runtime.metadata.json"), "utf8"),
);
if (
  manifest.version !== application.version ||
  runtime.version !== worker.version
)
  throw new Error("Local plugin/runtime pins are out of sync.");
async function files(directory) {
  const result = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, await files(file));
    else if (entry.isFile())
      result[relative(source, file).replaceAll("\\", "/")] = [
        new Uint8Array(await readFile(file)),
        { mtime: new Date(2020, 0, 1) },
      ];
    else throw new Error("Plugin archives cannot contain symlinks.");
  }
  return result;
}
const output = join(root, "dist/local-plugin");
await mkdir(output, { recursive: true });
await cp(source, join(output, "plugin"), { recursive: true });
await writeFile(
  join(output, `theoryfoundry-local-${manifest.version}.zip`),
  zipSync(await files(source)),
);
await mkdir(join(output, ".agents/plugins"), { recursive: true });
await writeFile(
  join(output, ".agents/plugins/marketplace.json"),
  JSON.stringify(
    {
      name: "theoryfoundry-local",
      plugins: [
        {
          name: "theoryfoundry-local",
          source: { source: "local", path: "./plugin" },
          policy: { installation: "AVAILABLE" },
          category: "Productivity",
        },
      ],
    },
    null,
    2,
  ) + "\n",
);
