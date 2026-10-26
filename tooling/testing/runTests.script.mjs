import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverTests,
  groupTests,
  runTestGroups,
} from "./testDiscovery.service.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const argumentsList = process.argv.slice(2);
if (
  argumentsList.some((argument) => !["--list", "--project"].includes(argument))
) {
  throw new Error(
    "Use --list to inspect discovery, or --project to run only the current workspace project.",
  );
}
const projects = JSON.parse(
  execFileSync("pnpm", ["list", "--recursive", "--depth", "-1", "--json"], {
    cwd: root,
    encoding: "utf8",
  }),
);
const groups = groupTests(root, await discoverTests(root), projects).filter(
  (group) =>
    !argumentsList.includes("--project") ||
    resolve(group.path) === process.cwd(),
);
if (groups.length === 0)
  throw new Error(
    `${process.cwd()}: no tests discovered; check workspace membership and test filenames.`,
  );
if (argumentsList.includes("--list")) {
  console.log(JSON.stringify(groups, null, 2));
} else {
  console.log(
    `Running ${groups.reduce((sum, group) => sum + group.files.length, 0)} test files across ${groups.length} workspace projects.`,
  );
  process.exitCode = runTestGroups(groups, spawnSync);
}
