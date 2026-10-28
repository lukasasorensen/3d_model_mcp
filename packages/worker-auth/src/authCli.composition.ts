import { WorkerAuthError } from "./shared/utils/authenticationError.util.js";
import { spawn } from "node:child_process";
import { createWorkerAuthentication } from "./authentication.composition.js";
const args = process.argv.slice(2);
const development = args.includes("--allow-loopback-http");
const [command, server, account, ...extra] = args.filter(
  (arg) => arg !== "--allow-loopback-http",
);
const abort = new AbortController();
const cancel = (): void => abort.abort();
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
try {
  if (
    !server ||
    extra.length ||
    (command !== "login" && command !== "logout") ||
    (command === "logout" ? !account : account)
  ) {
    throw new WorkerAuthError(
      "USAGE",
      "Usage: pnpm worker:auth login <origin> | logout <origin> <account-id> [--allow-loopback-http]",
    );
  }
  const auth = createWorkerAuthentication(server, {
    allowLoopbackHttp: development,
  });
  if (command === "login") {
    const owner = await auth.login(async (url) => {
      const executable =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "rundll32.exe"
            : "xdg-open";
      const arguments_ =
        process.platform === "win32"
          ? ["url.dll,FileProtocolHandler", url]
          : [url];
      await new Promise<void>((resolve, reject) => {
        const child = spawn(executable, arguments_, {
          stdio: "ignore",
          shell: false,
          signal: abort.signal,
        });
        child.once("error", reject);
        child.once("exit", (code) =>
          code === 0 ? resolve() : reject(new Error()),
        );
      });
    }, abort.signal);
    process.stderr.write(`Signed in. Account: ${owner}\n`);
  } else {
    await auth.logout(account!, abort.signal);
    process.stderr.write("Refresh credential revoked and removed.\n");
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof WorkerAuthError ? `${error.code}: ${error.message}` : "Worker authentication failed. Check the browser, credential store, and server."}\n`,
  );
  process.exitCode = 1;
} finally {
  process.off("SIGINT", cancel);
  process.off("SIGTERM", cancel);
}
