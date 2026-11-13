import { mkdir, readFile, cp, writeFile } from "node:fs/promises";
import { publishedRelease } from "./releaseManifest.util.mjs";
const root = new URL("../../", import.meta.url);
const application = JSON.parse(
  await readFile(new URL("package.json", root), "utf8"),
);
const worker = JSON.parse(
  await readFile(new URL("packages/local-worker/package.json", root), "utf8"),
);
const output = new URL("packages/local-worker/dist/local/", root);
const release = process.env.THEORYFOUNDRY_LOCAL_RELEASE_MANIFEST
  ? publishedRelease(
      JSON.parse(
        await readFile(
          process.env.THEORYFOUNDRY_LOCAL_RELEASE_MANIFEST,
          "utf8",
        ),
      ),
      application.version,
      worker.version,
    )
  : {
      version: application.version,
      workerVersion: worker.version,
      postgresMajor: 18,
      appImage: `theoryfoundry/local-app:${application.version}`,
      toolingImage: `theoryfoundry/local-tooling:${application.version}`,
      postgresImage: "postgres:18.6-bookworm",
    };
await mkdir(output, { recursive: true });
await cp(
  new URL("compose.self-host.yaml", root),
  new URL("compose.self-host.yaml", output),
);
await writeFile(
  new URL("local-release.json", output),
  JSON.stringify(release, null, 2) + "\n",
);
