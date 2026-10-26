import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

const excludedDirectories = new Set([
  "node_modules",
  ".git",
  ".pnpm-store",
  "dist",
  "coverage",
  "vendor",
  ".codex",
  ".omx",
  ".omc",
  ".cad-exports",
  "renderer-proof-output",
]);

export async function discoverTests(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        !excludedDirectories.has(entry.name) &&
        !entry.name.startsWith(".next")
      ) {
        files.push(...(await discoverTests(root, path)));
      }
    } else if (
      entry.isFile() &&
      /\.(?:test|spec)\.(?:mjs|cjs|js|ts|tsx)$/.test(entry.name)
    ) {
      files.push(relative(root, path));
    }
  }
  return files.sort();
}

export function groupTests(root, files, projects) {
  const ordered = [...projects].sort((a, b) => b.path.length - a.path.length);
  const groups = new Map();
  for (const file of files) {
    const absolute = resolve(root, file);
    const owner = ordered.find(({ path }) => {
      const inside = relative(path, absolute);
      return (
        inside !== ".." && !inside.startsWith("../") && !inside.startsWith("/")
      );
    });
    if (!owner)
      throw new Error(`${file}: no workspace owner; include the root project.`);
    if (!groups.has(owner.path))
      groups.set(owner.path, { ...owner, files: [] });
    groups.get(owner.path).files.push(relative(owner.path, absolute));
  }
  return [...groups.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function runTestGroups(groups, execute) {
  for (const group of groups) {
    const args = [
      ...(group.files.some((file) => /\.tsx?$/.test(file))
        ? ["--import", "tsx"]
        : []),
      "--test",
      ...group.files,
    ];
    const result = execute(process.execPath, args, {
      cwd: group.path,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}
