import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { LocalWorkerError } from "../../shared/utils/workerError.util.js";
function run(
  executable: string,
  args: string[],
  signal: AbortSignal,
  output: "ignore" | "inherit",
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      signal,
      stdio: [
        "ignore",
        output === "inherit" ? process.stderr : "ignore",
        output === "inherit" ? process.stderr : "ignore",
      ],
    });
    child.once("error", () =>
      reject(
        new LocalWorkerError(
          "COMMAND_FAILED",
          "Could not start setup or the system browser. Check your runtime prerequisites.",
        ),
      ),
    );
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new LocalWorkerError(
              "COMMAND_FAILED",
              "Setup or the system browser failed. Check prerequisites and retry.",
            ),
          ),
    );
  });
}
export function installBrowser(signal: AbortSignal): Promise<void> {
  const require = createRequire(import.meta.url);
  const cli = join(
    dirname(require.resolve("playwright/package.json")),
    "cli.js",
  );
  return run(
    process.execPath,
    [cli, "install", "chromium"],
    AbortSignal.any([signal, AbortSignal.timeout(600_000)]),
    "inherit",
  );
}
export function openSystemBrowser(
  url: string,
  signal: AbortSignal,
): Promise<void> {
  const executable =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "rundll32.exe"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  return run(
    executable,
    args,
    AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    "ignore",
  );
}
