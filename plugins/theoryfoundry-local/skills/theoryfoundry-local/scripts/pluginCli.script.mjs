import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const metadata = JSON.parse(
  readFileSync(
    new URL("../../../runtime.metadata.json", import.meta.url),
    "utf8",
  ),
);
if (
  metadata.package !== "@tfoundry/local-worker" ||
  !/^\d+\.\d+\.\d+$/.test(metadata.version)
)
  throw new Error("Invalid bundled worker release.");
const args = process.argv.slice(2);
// An explicit local candidate supports pre-publication acceptance without registry fallback.
const candidate = process.env.THEORYFOUNDRY_LOCAL_CLI;
let command = "npx";
let invocation = ["--yes", `${metadata.package}@${metadata.version}`, ...args];
if (candidate) {
  if (!isAbsolute(candidate))
    throw new Error("THEORYFOUNDRY_LOCAL_CLI must be absolute.");
  const version = spawnSync(process.execPath, [candidate, "--version"], {
    encoding: "utf8",
  });
  if (version.status !== 0 || version.stdout.trim() !== metadata.version)
    throw new Error(
      "Local candidate does not match the plugin's pinned worker release.",
    );
  command = process.execPath;
  invocation = [candidate, ...args];
}
const result = spawnSync(command, invocation, {
  cwd: homedir(),
  env: {
    ...process.env,
    THEORYFOUNDRY_CALLER_DIRECTORY: resolve(process.cwd()),
  },
  stdio: "inherit",
  shell: false,
});
if (result.error)
  throw new Error(
    "Cannot launch the pinned worker. Check Node 24, npm and release availability.",
  );
process.exitCode = result.status ?? 1;
