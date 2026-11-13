import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { spawn } from "node:child_process";
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
const groups = process.platform !== "win32";
let active;
let cancellation;
let deadline;
function signalChild(signal) {
  if (!active?.pid) return;
  try {
    if (groups) process.kill(-active.pid, signal);
    else active.kill(signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
function cancel(signal) {
  if (cancellation) return;
  cancellation = signal;
  signalChild(signal);
  // Allow the worker's 30-second cleanup and bounded Docker shutdown to finish.
  deadline = setTimeout(() => {
    signalChild("SIGKILL");
    process.stderr.write(
      "LOCAL_CANCELLED: Worker cleanup timed out. Run local stop before retrying.\n",
    );
  }, 45000);
}
const interrupt = () => cancel("SIGINT");
const terminate = () => cancel("SIGTERM");
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);

async function run(command, invocation, capture = false) {
  if (cancellation) return { status: 1, stdout: "" };
  return new Promise((resolveRun) => {
    const child = spawn(command, invocation, {
      cwd: homedir(),
      env: {
        ...process.env,
        THEORYFOUNDRY_CALLER_DIRECTORY: resolve(process.cwd()),
      },
      detached: groups,
      stdio: [capture ? "ignore" : "inherit", "pipe", "pipe"],
      shell: false,
    });
    active = child;
    let stdout = "";
    let error;
    if (capture) {
      child.stdout.on("data", (chunk) => {
        if (stdout.length + chunk.length > 4096) {
          error = new Error("Candidate version output exceeded its limit.");
          cancel("SIGTERM");
        } else stdout += chunk;
      });
      child.stderr.resume();
    } else {
      child.stdout.pipe(process.stdout, { end: false });
      child.stderr.pipe(process.stderr, { end: false });
    }
    child.once("error", (failure) => {
      error = failure;
    });
    // close waits for inherited output pipes, including a worker whose npm parent exited.
    child.once("close", (status) => {
      active = undefined;
      resolveRun({ status, stdout, error });
    });
  });
}
try {
  let command = "npx";
  let invocation = [
    "--yes",
    `${metadata.package}@${metadata.version}`,
    ...args,
  ];
  if (candidate) {
    if (!isAbsolute(candidate))
      throw new Error("THEORYFOUNDRY_LOCAL_CLI must be absolute.");
    const version = await run(process.execPath, [candidate, "--version"], true);
    if (
      !cancellation &&
      (version.status !== 0 || version.stdout.trim() !== metadata.version)
    )
      throw new Error(
        "Local candidate does not match the plugin's pinned worker release.",
      );
    command = process.execPath;
    invocation = [candidate, ...args];
  }
  const result = await run(command, invocation);
  if (result.error)
    throw new Error(
      "Cannot launch the pinned worker. Check Node 24, npm and release availability.",
    );
  process.exitCode = result.status ?? 1;
} finally {
  clearTimeout(deadline);
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", terminate);
  if (cancellation) process.exitCode = cancellation === "SIGINT" ? 130 : 143;
}
