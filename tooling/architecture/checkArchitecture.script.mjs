import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkArchitecture } from "./architecture.policy.mjs";
import {
  architectureBaselinePath,
  compareArchitectureBaselines,
  evaluateArchitectureBaseline,
} from "./architectureBaseline.policy.mjs";
import { readPreviousArchitectureBaseline } from "./baseSnapshot.repository.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const current = JSON.parse(
  await readFile(path.join(root, architectureBaselinePath), "utf8"),
);
const previous = await readPreviousArchitectureBaseline(
  root,
  process.env.ALIGNMENT_BASE_REF || "origin/master",
);
const findings = await checkArchitecture(root);
const errors = [
  ...compareArchitectureBaselines(current, previous),
  ...evaluateArchitectureBaseline(findings, current),
];
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Architecture passed: workspace source exports, aliases, module/layer/barrel boundaries and browser graphs; ${current.violations.length} shrinking legacy exceptions.`,
  );
