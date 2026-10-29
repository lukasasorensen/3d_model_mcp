import { build } from "esbuild";
import { builtinModules } from "node:module";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = join(root, "dist/local-worker-package");
const folders = [
  "local-worker",
  "worker-auth",
  "browser-renderer",
  "contracts",
];
const projects = new Map(
  await Promise.all(
    folders.map(async (folder) => {
      const directory = join(root, "packages", folder);
      const manifest = JSON.parse(
        await readFile(join(directory, "package.json"), "utf8"),
      );
      return [manifest.name, { directory, manifest }];
    }),
  ),
);
const worker = projects.get("@theoryfoundry/local-worker").manifest;
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(worker.version))
  throw new Error("Worker requires an explicit release version.");
await rm(output, { recursive: true, force: true });
await mkdir(join(output, "dist"), { recursive: true });
const result = await build({
  entryPoints: {
    cli: join(root, "packages/local-worker/dist/workerCli.composition.js"),
  },
  outdir: join(output, "dist"),
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node24",
  packages: "external",
  metafile: true,
  sourcemap: false,
  plugins: [
    {
      name: "internal-workspaces",
      setup(builder) {
        builder.onResolve({ filter: /^@theoryfoundry\// }, (args) => {
          const parts = args.path.split("/");
          const name = parts.slice(0, 2).join("/");
          const project = projects.get(name);
          if (!project)
            throw new Error(`Unexpected private dependency ${name}`);
          const key =
            parts.length === 2 ? "." : `./${parts.slice(2).join("/")}`;
          const entry = project.manifest.exports[key];
          const path = typeof entry === "string" ? entry : entry?.import;
          if (!path)
            throw new Error(`Missing public runtime export ${args.path}`);
          return { path: resolve(project.directory, path), sideEffects: false };
        });
      },
    },
  ],
});
const dependencies = {};
for (const imported of Object.values(result.metafile.outputs)
  .flatMap((value) => value.imports)
  .filter((value) => value.external)) {
  if (
    imported.path.startsWith("node:") ||
    builtinModules.includes(imported.path)
  )
    continue;
  const name = imported.path.startsWith("@")
    ? imported.path.split("/").slice(0, 2).join("/")
    : imported.path.split("/")[0];
  if (
    name.startsWith(".") ||
    name.startsWith("/") ||
    name.startsWith("@theoryfoundry/")
  )
    throw new Error(`Nonportable import ${imported.path}`);
  let installed;
  for (const project of projects.values()) {
    if (!project.manifest.dependencies?.[name]) continue;
    installed = JSON.parse(
      await readFile(
        join(project.directory, "node_modules", name, "package.json"),
        "utf8",
      ),
    );
    break;
  }
  if (!installed) throw new Error(`Undeclared release dependency ${name}`);
  dependencies[name] = installed.version;
}
await cp(
  join(root, "packages/local-worker/dist/assets"),
  join(output, "dist/assets"),
  { recursive: true },
);
await cp(
  join(root, "packages/local-worker/README.md"),
  join(output, "README.md"),
);
await cp(
  join(root, "packages/local-worker/THIRD_PARTY_NOTICES.md"),
  join(output, "THIRD_PARTY_NOTICES.md"),
);
await cp(
  join(root, "packages/local-worker/licenses"),
  join(output, "licenses"),
  { recursive: true },
);
for (const name of ["three", "fflate"]) {
  const directory = join(root, "packages/browser-renderer/node_modules", name);
  const file = (await readdir(directory)).find((name) =>
    /^LICENSE(?:\.txt|\.md)?$/i.test(name),
  );
  if (!file) throw new Error(`Missing license for bundled ${name}`);
  await cp(join(directory, file), join(output, "licenses", `${name}.txt`));
}
await writeFile(
  join(output, "package.json"),
  JSON.stringify(
    {
      name: worker.name,
      version: worker.version,
      description:
        "Local stdio CAD worker with hosted projects and secure OAuth credentials",
      type: "module",
      license: "UNLICENSED",
      bin: { "theoryfoundry-worker": "dist/cli.js" },
      files: ["dist", "README.md", "THIRD_PARTY_NOTICES.md", "licenses"],
      engines: { node: ">=24 <25" },
      repository: {
        type: "git",
        url: "https://github.com/lukasasorensen/3d_model_mcp.git",
        directory: "packages/local-worker",
      },
      dependencies: Object.fromEntries(
        Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)),
      ),
    },
    null,
    2,
  ) + "\n",
);
console.log(`Prepared ${worker.name}@${worker.version} at ${output}`);
