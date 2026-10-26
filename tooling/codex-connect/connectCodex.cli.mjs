import { runInstaller } from "./installer.service.mjs";

runInstaller(process.argv.slice(2)).catch((error) => {
  console.error(`Connect to Codex: ${error.message}`);
  process.exitCode = 1;
});
