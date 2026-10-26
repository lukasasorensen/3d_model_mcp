import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export const normalize = (file) => file.replaceAll("\\", "/");
export const relativeTo = (root, file) => normalize(path.relative(root, file));
export const isTest = (file) =>
  /\.(test|spec)\.[cm]?[jt]sx?$|\/(tests|test-support|fixtures)\//.test(file);
export const isSource = (file) =>
  /\.[cm]?[jt]sx?$/.test(file) && !/\.d\.[cm]?ts$/.test(file);
export function walkSource(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkSource(child);
    return entry.isFile() && isSource(child) ? [child] : [];
  });
}

function configFor(directory) {
  const configPath = path.join(directory, "tsconfig.json");
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error)
    throw new Error(
      `${configPath}: ${ts.flattenDiagnosticMessageText(loaded.error.messageText, "\n")}`,
    );
  const parsed = ts.parseJsonConfigFileContent(
    loaded.config,
    ts.sys,
    directory,
  );
  const errors = parsed.errors.filter((error) => error.code !== 18003);
  if (errors.length)
    throw new Error(
      `${configPath}: ${errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, "\n")).join("; ")}`,
    );
  return parsed.options;
}
function exportTarget(value) {
  if (typeof value === "string") return value;
  if (!value || Array.isArray(value)) return undefined;
  return (
    exportTarget(value.types) ??
    exportTarget(value.import) ??
    exportTarget(value.default)
  );
}

export function loadWorkspace(root, projectPaths) {
  root = realpathSync(root);
  const paths =
    projectPaths ??
    JSON.parse(
      execFileSync("pnpm", ["list", "-r", "--depth", "-1", "--json"], {
        cwd: root,
        encoding: "utf8",
      }),
    )
      .map((project) => relativeTo(root, project.path))
      .filter(Boolean);
  const projects = paths
    .map((directory) => {
      const absolute = path.resolve(root, directory);
      const manifest = JSON.parse(
        readFileSync(path.join(absolute, "package.json"), "utf8"),
      );
      const options = configFor(absolute);
      const src = options.rootDir ?? path.join(absolute, "src");
      const out = options.outDir ?? path.join(absolute, "dist");
      const entries = new Map();
      const exports = manifest.exports ?? {};
      for (const [subpath, value] of Object.entries(
        Object.keys(exports).some((key) => key.startsWith("."))
          ? exports
          : { ".": exports },
      )) {
        const target = exportTarget(value);
        if (!target) continue;
        if (subpath.includes("*"))
          throw new Error(
            `${directory}/package.json: enumerate public export subpaths so architecture checks can map them to source.`,
          );
        const artifact = path.resolve(absolute, target);
        let source = artifact;
        if (artifact.startsWith(out + path.sep)) {
          const stem = path
            .join(src, path.relative(out, artifact))
            .replace(/(?:\.d)?\.[cm]?js$|\.d\.[cm]?ts$/, "");
          source = [".ts", ".tsx", ".mts", ".cts", ".mjs", ".js"]
            .map((ext) => stem + ext)
            .find(existsSync);
        }
        if (!source || !existsSync(source))
          throw new Error(
            `${directory}/package.json: public export ${subpath} has no source equivalent for ${target}; fix exports/rootDir/outDir.`,
          );
        entries.set(
          manifest.name + (subpath === "." ? "" : subpath.slice(1)),
          source,
        );
      }
      return {
        directory: normalize(directory),
        absolute,
        name: manifest.name,
        src,
        out,
        options,
        entries,
      };
    })
    .sort((a, b) => b.absolute.length - a.absolute.length);
  const owner = (file) => {
    const canonical =
      !file.startsWith(root + path.sep) && existsSync(file)
        ? realpathSync(file)
        : file;
    return projects.find((p) => canonical.startsWith(p.absolute + path.sep));
  };
  const files = projects
    .flatMap((p) => walkSource(p.src))
    .filter((file) => !isTest(normalize(file)));
  const publicEntries = new Map(projects.flatMap((p) => [...p.entries]));
  return {
    root,
    projects,
    owner,
    files: [...new Set(files)].sort(),
    publicEntries,
  };
}

export function createWorkspaceProgram(workspace) {
  const paths = Object.fromEntries(
    [...workspace.publicEntries].map(([name, file]) => [name, [file]]),
  );
  const options = {
    allowJs: true,
    checkJs: false,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    jsx: ts.JsxEmit.Preserve,
  };
  const host = ts.createCompilerHost(options);
  const cache = new Map();
  const resolve = (specifier, file) => {
    const owner = workspace.owner(file);
    const settings = {
      ...options,
      ...owner?.options,
      paths: { ...paths, ...owner?.options.paths },
    };
    const key = `${file}\0${specifier}`;
    if (!cache.has(key))
      cache.set(
        key,
        ts.resolveModuleName(specifier, file, settings, ts.sys).resolvedModule,
      );
    return cache.get(key);
  };
  host.resolveModuleNames = (names, file) =>
    names.map((name) => resolve(name, file));
  const program = ts.createProgram(workspace.files, options, host);
  return { program, checker: program.getTypeChecker(), resolve };
}
