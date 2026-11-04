import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const output = new URL("dist/codex-connect-package/", root);
// Package exactly the checked hosted installer, including its bundled TOML license.
execFileSync(
  process.execPath,
  [
    fileURLToPath(new URL("./buildInstaller.script.mjs", import.meta.url)),
    "--check",
  ],
  { stdio: "inherit" },
);
const installer = await readFile(
  new URL("apps/site/public/installers/connect-codex-v1.mjs", root),
  "utf8",
);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(
  new URL("connect-codex.mjs", output),
  `#!/usr/bin/env node\n${installer}`,
  { mode: 0o755 },
);
await cp(
  new URL("./package.metadata.json", import.meta.url),
  new URL("package.json", output),
);
await cp(new URL("./README.md", import.meta.url), new URL("README.md", output));
console.log(`Prepared Codex installer at ${fileURLToPath(output)}`);
