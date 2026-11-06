#!/usr/bin/env node
if (process.argv[2] === "ai") {
  const { runAiCompanion } = await import("./aiCompanion.composition.js");
  process.exitCode = await runAiCompanion(process.argv.slice(3));
} else {
  await import("./rendererCli.composition.js");
}
