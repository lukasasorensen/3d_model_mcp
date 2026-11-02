import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildPluginPackages } from "./pluginPackage.service.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
if (process.argv.slice(2).some((argument) => argument !== "--release"))
  throw new Error("Usage: pnpm pack:plugins [--release]");
const result = await buildPluginPackages(
  root,
  join(root, "dist/mcp-plugins"),
  process.argv.includes("--release"),
);
console.log(JSON.stringify(result, null, 2));
