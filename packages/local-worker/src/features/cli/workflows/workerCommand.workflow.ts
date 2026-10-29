import { createHash } from "node:crypto";
import type {
  CommandDependencies,
  WorkerCommand,
  Diagnostic,
} from "../../../domains/installation/index.js";
import { LocalWorkerError } from "../../../shared/utils/workerError.util.js";
import { WorkerAuthError } from "@theoryfoundry/worker-auth/errors";
import { commandHelp } from "../utils/commandHelp.util.js";
const describe = (error: unknown): string =>
  error instanceof LocalWorkerError || error instanceof WorkerAuthError
    ? `${error.code}: ${error.message}`
    : "RUNTIME_UNAVAILABLE: Check Node 24, the installed dependencies, OS credential storage, and Chromium prerequisites.";
export async function runWorkerCommand(
  command: WorkerCommand,
  dependencies: CommandDependencies,
  signal: AbortSignal,
): Promise<number> {
  const { metadata, stdout, stderr, renderer } = dependencies;
  if (command.command === "help") {
    stdout(commandHelp(metadata));
    return 0;
  }
  if (command.command === "version") {
    stdout(`${metadata.version}\n`);
    return 0;
  }
  try {
    signal.throwIfAborted();
    if (command.command === "serve") {
      await dependencies.serve(command.target, signal);
      return 0;
    }
    if (command.command === "login" || command.command === "logout") {
      const auth = await dependencies.loadAuthentication(command.target);
      if (!auth) throw new Error("Missing authentication adapter.");
      if (command.command === "login") {
        const account = await auth.login(
          (url) => dependencies.openBrowser(url, signal),
          signal,
        );
        stderr(`Signed in. Account: ${account}\n`);
        stderr(
          `MCP command: pnpm --silent dlx ${metadata.name}@${metadata.version} serve --server ${command.target.server} --account ${account}${command.target.allowLoopbackHttp ? " --allow-loopback-http" : ""}\n`,
        );
      } else {
        await auth.logout(command.target.account!, signal);
        stderr("Refresh credential revoked and removed.\n");
      }
      return 0;
    }
    if (command.command === "setup") {
      await dependencies.prepareAssets(signal);
      await dependencies.installBrowser(signal);
    }
    const checks: Diagnostic[] = [];
    try {
      const source = "cube([3,4,5]);";
      const result = await renderer.render(
        {
          source,
          sourceHash: createHash("sha256").update(source).digest("hex"),
          format: "png",
          view: "isometric",
        },
        signal,
      );
      if (!result.ok)
        throw new LocalWorkerError(
          "RENDER_FAILED",
          "Renderer smoke test failed. Run setup and check OS Chromium dependencies.",
        );
      checks.push({
        check: "renderer",
        status: "ok",
        message:
          "Pinned assets, sandboxed Chromium, OpenSCAD WASM and PNG rendering passed.",
      });
    } catch (error) {
      checks.push({
        check: "renderer",
        status: "failed",
        message: describe(error),
      });
    } finally {
      await renderer.close();
    }
    if (command.command === "doctor") {
      try {
        const auth = await dependencies.loadAuthentication(command.target);
        checks.push({
          check: "native-credentials",
          status: "ok",
          message:
            "Native credential binding loaded; store access is checked only with an account.",
        });
        if (auth && command.target) {
          await auth.accessToken(command.target.account!, signal);
          checks.push({
            check: "account",
            status: "ok",
            message:
              "Stored account can obtain a verified hosted access token.",
          });
        } else
          checks.push({
            check: "account",
            status: "skipped",
            message:
              "Supply --server and --account to check credential access and OAuth. No account was accessed.",
          });
      } catch (error) {
        checks.push({
          check: "credentials",
          status: "failed",
          message: describe(error),
        });
      }
    }
    const ok = checks.every((check) => check.status !== "failed");
    if (command.command === "doctor" && command.json)
      stdout(
        `${JSON.stringify({ package: metadata.name, version: metadata.version, ok, checks })}\n`,
      );
    else
      for (const check of checks)
        stderr(
          `${check.status.toUpperCase()} ${check.check}: ${check.message}\n`,
        );
    if (command.command === "setup" && ok && command.installation) {
      signal.throwIfAborted();
      const installation = command.installation;
      const auth = await dependencies.loadAuthentication(installation.target);
      if (!auth) throw new Error("Missing authentication adapter.");
      const account = installation.target.account
        ? (await auth.accessToken(installation.target.account, signal)).account
        : await auth.login(
            (url) => dependencies.openBrowser(url, signal),
            signal,
          );
      signal.throwIfAborted();
      const receipt = await dependencies.configureClient(
        { ...installation, target: { ...installation.target, account } },
        signal,
      );
      stderr(
        `Configuration ${receipt.changed ? "saved" : "already installed"}: ${receipt.path}\n`,
      );
      if (receipt.backup) stderr(`Backup: ${receipt.backup}\n`);
      stderr(
        "Restart your client or start a fresh session. The project browser tab may be closed.\n",
      );
    } else if (command.command === "setup" && ok)
      stderr(
        "Setup complete. Run login for your hosted server, then configure serve using the printed account ID.\n",
      );
    return ok ? 0 : 1;
  } catch (error) {
    stderr(
      `${signal.aborted ? "CANCELLED: Worker command cancelled." : describe(error)}\n`,
    );
    return 1;
  }
}
