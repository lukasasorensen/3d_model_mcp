import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  baselinePath,
  bootstrapCommit,
  inspectSource,
} from "./sourceConventions.policy.mjs";
import {
  compareBaselines,
  evaluateRecords,
  validateBaseline,
} from "./legacyBaseline.policy.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
const mode = process.argv[2] ?? "all";
if (!["all", "format", "conventions"].includes(mode))
  throw new Error("Expected all, format, or conventions.");
const baseline = JSON.parse(
  await readFile(new URL(`../../${baselinePath}`, import.meta.url), "utf8"),
);
validateBaseline(baseline);
const baseRef = process.env.ALIGNMENT_BASE_REF || "origin/master";
// Resolve first: missing history must fail, never disable the ratchet.
const revision = git("rev-parse", "--verify", `${baseRef}^{commit}`).trim();
const previousPaths = git("ls-tree", "-r", "--name-only", revision).split("\n");
let previous;
if (previousPaths.includes(baselinePath)) {
  previous = JSON.parse(git("show", `${revision}:${baselinePath}`));
} else {
  if (revision !== bootstrapCommit || baseline.sourceCommit !== bootstrapCommit)
    throw new Error(
      "Baseline bootstrap requires the recorded pre-alignment commit; fetch full history and set ALIGNMENT_BASE_REF to the actual PR base.",
    );
  previous = { version: 1, sourceCommit: bootstrapCommit, files: {} };
  for (const file of Object.keys(baseline.files)) {
    if (previousPaths.includes(file)) {
      const record = await inspectSource(
        file,
        git("show", `${revision}:${file}`),
      );
      if (Object.keys(record).length) previous.files[file] = record;
    }
  }
}
const actual = {};
const files = [
  ...new Set(
    git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
      .split("\0")
      .filter(Boolean),
  ),
];
for (const file of files) {
  try {
    actual[file] = await inspectSource(
      file,
      await readFile(resolve(root, file), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error(
        `${file}: inspection failed; fix parsing/read errors before verification`,
        { cause: error },
      );
  }
}
const findings = [
  ...(Object.keys(baseline.files).length
    ? [
        "Legacy convention exceptions are no longer permitted; keep the baseline empty.",
      ]
    : []),
  ...compareBaselines(baseline, previous),
  ...evaluateRecords(actual, baseline, mode),
];
if (findings.length) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Conventions (${mode}) passed for ${files.length} files; ${Object.keys(baseline.files).length} legacy records, ratcheted against ${revision.slice(0, 12)}.`,
  );
