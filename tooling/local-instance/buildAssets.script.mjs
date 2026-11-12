import { mkdir, readFile, cp, writeFile } from "node:fs/promises";
const root = new URL("../../", import.meta.url);
const application = JSON.parse(
  await readFile(new URL("package.json", root), "utf8"),
);
const worker = JSON.parse(
  await readFile(new URL("packages/local-worker/package.json", root), "utf8"),
);
const output = new URL("packages/local-worker/dist/local/", root);
await mkdir(output, { recursive: true });
await cp(
  new URL("compose.self-host.yaml", root),
  new URL("compose.self-host.yaml", output),
);
await writeFile(
  new URL("local-release.json", output),
  JSON.stringify(
    {
      version: application.version,
      workerVersion: worker.version,
      postgresMajor: 18,
      appImage: `theoryfoundry/local-app:${application.version}`,
      toolingImage: `theoryfoundry/local-tooling:${application.version}`,
    },
    null,
    2,
  ) + "\n",
);
