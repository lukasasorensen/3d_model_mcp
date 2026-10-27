import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runProof } from "./acceptance/renderer.workflow.mjs";

// Bundled next to public/, so this works from any cwd without the checkout.
const output = resolve(process.argv[2] ?? "renderer-proof-output");
try {
  const report = await runProof(new URL("./public/", import.meta.url), output);
  report.cleanup =
    "Browser and loopback server closed before writing this report.";
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        output,
        startupMs: report.startupMs,
        totalMs: report.totalMs,
        checks: report.checks,
        artifacts: report.artifacts.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
