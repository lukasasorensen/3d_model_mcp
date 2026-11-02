import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { strToU8, zipSync } from "fflate";
import { pluginManifests } from "./pluginManifests.util.mjs";

async function archiveFiles(directory, base = directory) {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory())
      Object.assign(result, await archiveFiles(file, base));
    else if (entry.isFile())
      result[relative(base, file).replaceAll("\\", "/")] = [
        new Uint8Array(await readFile(file)),
        { mtime: new Date("2020-01-01T00:00:00Z") },
      ];
    else throw new Error("Plugin packages cannot contain symlinks.");
  }
  return result;
}

export async function buildPluginPackages(root, output, release = false) {
  const source = join(root, "plugins/theoryfoundry");
  const metadata = JSON.parse(
    await readFile(join(source, "plugin.metadata.json"), "utf8"),
  );
  const publication = JSON.parse(
    await readFile(join(source, "publication.metadata.json"), "utf8"),
  );
  const rootPackage = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  if (metadata.version !== rootPackage.version)
    throw new Error("Plugin and application release versions must match.");
  const missing = [
    "supportURL",
    "privacyPolicyURL",
    "termsOfServiceURL",
    "demoRecordingURL",
  ].filter((key) => !publication[key]);
  if (release && missing.length)
    throw new Error(
      `Public submission is not ready: ${missing.join(", ")}. See docs/plugin-release.md.`,
    );
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const client of ["codex", "claude"]) {
    const directory = join(output, client);
    const manifestFolder =
      client === "codex" ? ".codex-plugin" : ".claude-plugin";
    await mkdir(join(directory, manifestFolder), { recursive: true });
    const { manifest, mcp } = pluginManifests(metadata, publication, client);
    await writeFile(
      join(directory, manifestFolder, "plugin.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    await writeFile(
      join(directory, ".mcp.json"),
      JSON.stringify(mcp, null, 2) + "\n",
    );
    for (const file of ["README.md", "skills", "assets"])
      await cp(join(source, file), join(directory, file), { recursive: true });
    await writeFile(
      join(output, `${metadata.name}-${client}-${metadata.version}.zip`),
      zipSync(await archiveFiles(directory)),
    );
  }
  const codexCatalog = {
    name: "theoryfoundry",
    interface: { displayName: "TheoryFoundry" },
    plugins: [
      {
        name: metadata.name,
        source: { source: "local", path: "./codex" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Productivity",
      },
    ],
  };
  await mkdir(join(output, ".agents/plugins"), { recursive: true });
  await writeFile(
    join(output, ".agents/plugins/marketplace.json"),
    JSON.stringify(codexCatalog, null, 2) + "\n",
  );
  await mkdir(join(output, ".claude-plugin"), { recursive: true });
  await writeFile(
    join(output, ".claude-plugin/marketplace.json"),
    JSON.stringify(
      {
        name: "theoryfoundry",
        owner: metadata.author,
        plugins: [
          {
            name: metadata.name,
            source: "./claude",
            description: metadata.description,
            version: metadata.version,
          },
        ],
      },
      null,
      2,
    ) + "\n",
  );
  const readiness = {
    version: metadata.version,
    origin: metadata.origin,
    missingPublicationMetadata: missing,
    pending: [
      "publisher/domain verification",
      "dedicated reviewer accounts",
      "directory review and approval",
      "live Codex and Claude Code acceptance",
    ],
  };
  await writeFile(
    join(output, "release-readiness.json"),
    strToU8(JSON.stringify(readiness, null, 2) + "\n"),
  );
  return readiness;
}
