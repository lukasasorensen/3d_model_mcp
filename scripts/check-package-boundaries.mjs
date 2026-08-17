import { builtinModules } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const allowedDependencies = new Map([
  ["contracts", new Set()],
  ["model-project", new Set(["contracts"])],
  ["renderer", new Set(["contracts"])],
  ["mcp", new Set(["contracts", "model-project", "renderer"])],
  ["gateway", new Set(["contracts", "mcp"])],
  ["runtime", new Set(["contracts", "gateway", "mcp", "model-project", "renderer"])],
]);
const serverOnlyPackages = new Set(["model-project", "renderer", "mcp", "gateway", "runtime"]);
const nodeBuiltins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const sourceExtensions = new Set([".js", ".mjs", ".ts", ".tsx"]);
const providerPrefixes = ["@anthropic-ai/", "@google/generative-ai", "@langchain/", "langchain", "openai"];

function isProvider(specifier) {
  return providerPrefixes.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`) || specifier.startsWith(prefix));
}

function importsFrom(source) {
  return [...source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)["']([^"']+)["']/g)].map((match) => match[1]);
}

function isTestFile(file) {
  return /(?:^|\/)(?:__tests__\/|[^/]+\.(?:test|spec)\.[^.]+$)/.test(file);
}

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && [".git", ".next", ".omx", "dist", "node_modules"].includes(entry.name)) continue;
    const child = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(child)));
    else if (sourceExtensions.has(extname(child))) files.push(child);
  }
  return files;
}

async function collectIfPresent(directory) {
  try { return await collect(directory); }
  catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return []; throw error; }
}

function resolveLocalImport(fromFile, specifier, sourceFiles) {
  if (!specifier.startsWith(".")) return undefined;
  const candidate = resolve(dirname(fromFile), specifier);
  const options = extname(candidate)
    ? [candidate]
    : [candidate, ...[".ts", ".tsx", ".js", ".mjs"].map((extension) => `${candidate}${extension}`), ...[".ts", ".tsx", ".js", ".mjs"].map((extension) => join(candidate, `index${extension}`))];
  return options.find((option) => sourceFiles.has(option));
}

export async function checkWorkspaceBoundaries(workspaceRoot = process.cwd()) {
  const absoluteRoot = resolve(workspaceRoot);
  const files = [...(await collect(join(absoluteRoot, "packages"))), ...(await collect(join(absoluteRoot, "apps", "site")))];
  const sourceFiles = new Set(files);
  const sources = new Map(await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")])));
  const findings = [];

  for (const absoluteFile of files) {
    const file = relative(absoluteRoot, absoluteFile);
    const source = sources.get(absoluteFile) ?? "";
    const packageName = file.match(/^packages\/([^/]+)\//)?.[1];
    for (const specifier of importsFrom(source)) {
      if (/^@rjls\/[^/]+\/(?:src|dist)(?:\/|$)/.test(specifier)) findings.push(`${file}: deep-imports another workspace package`);
      const workspaceImport = specifier.match(/^@rjls\/([^/]+)$/)?.[1];
      if (packageName && workspaceImport && !allowedDependencies.get(packageName)?.has(workspaceImport)) {
        findings.push(`${file}: ${packageName} cannot depend on ${workspaceImport}`);
      }
      if (packageName === "contracts" && !isTestFile(file) && (nodeBuiltins.has(specifier) || isProvider(specifier) || specifier === "next" || specifier.startsWith("next/"))) {
        findings.push(`${file}: browser-safe contracts import a server-only module`);
      }
    }
    if (packageName === "gateway" && /@rjls\/(?:model-project|renderer)|createCadToolRegistry|invokeCadTool/.test(source)) {
      findings.push(`${file}: gateway bypasses the MCP client boundary`);
    }
  }

  const clientEntries = files.filter((file) => {
    const relativeFile = relative(absoluteRoot, file);
    return relativeFile.startsWith("apps/site/") && !isTestFile(relativeFile) && /^\s*["']use client["'];/m.test(sources.get(file) ?? "");
  });
  for (const entry of clientEntries) {
    const pending = [entry];
    const visited = new Set();
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      for (const specifier of importsFrom(sources.get(current) ?? "")) {
        if (nodeBuiltins.has(specifier) || isProvider(specifier) || /^@rjls\/(?:model-project|renderer|mcp|gateway|runtime)$/.test(specifier)) {
          findings.push(`${relative(absoluteRoot, entry)}: client dependency ${relative(absoluteRoot, current)} imports server-only ${specifier}`);
        }
        const localFile = resolveLocalImport(current, specifier, sourceFiles);
        if (localFile) pending.push(localFile);
      }
    }
  }

  for (const packageName of allowedDependencies.keys()) {
    const manifestPath = join(absoluteRoot, "packages", packageName, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const dependencies = Object.keys(manifest.dependencies ?? {});
    for (const dependency of dependencies) {
      const workspaceDependency = dependency.match(/^@rjls\/([^/]+)$/)?.[1];
      if (workspaceDependency && !allowedDependencies.get(packageName)?.has(workspaceDependency)) findings.push(`${relative(absoluteRoot, manifestPath)}: disallowed dependency ${dependency}`);
      if (packageName === "contracts" && (isProvider(dependency) || serverOnlyPackages.has(dependency.replace("@rjls/", "")))) {
        findings.push(`${relative(absoluteRoot, manifestPath)}: contracts dependency ${dependency} is not browser-safe`);
      }
    }
  }

  const clientChunks = await collectIfPresent(join(absoluteRoot, "apps", "site", ".next", "static", "chunks"));
  const forbiddenClientCanaries = ["@rjls/runtime", "@rjls/model-project", "@rjls/renderer", "node:fs", "node:path", ".rjls-projects", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
  for (const chunk of clientChunks) {
    const source = await readFile(chunk, "utf8");
    for (const canary of forbiddenClientCanaries) if (source.includes(canary)) findings.push(`${relative(absoluteRoot, chunk)}: client build contains server-only canary ${canary}`);
  }

  return { filesChecked: files.length, findings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await checkWorkspaceBoundaries(process.cwd());
  if (result.findings.length > 0) {
    console.error(["Package boundary check failed:", ...result.findings.map((finding) => `- ${finding}`)].join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Package boundary check passed across ${result.filesChecked} source files and ${allowedDependencies.size} packages.`);
  }
}
