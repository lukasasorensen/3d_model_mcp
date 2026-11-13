#!/usr/bin/env node
import { isAbsolute } from "node:path";
const callerDirectory = process.env.THEORYFOUNDRY_CALLER_DIRECTORY;
if (callerDirectory) {
  if (!isAbsolute(callerDirectory))
    throw new Error("Caller directory must be absolute.");
  process.chdir(callerDirectory);
}
if (process.argv[2] === "local") {
  await import("./localInstance.composition.js");
} else if (["connect", "call", "tools"].includes(process.argv[2] ?? "")) {
  await import("./agentCli.composition.js");
} else if (process.argv[2] === "ai") {
  const { runAiCompanion } = await import("./aiCompanion.composition.js");
  process.exitCode = await runAiCompanion(process.argv.slice(3));
} else {
  await import("./rendererCli.composition.js");
}
