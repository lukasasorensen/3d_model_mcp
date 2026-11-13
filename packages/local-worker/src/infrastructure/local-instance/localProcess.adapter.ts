import { spawn } from "node:child_process";
import type {
  RunLocalProcess,
  ProcessResult,
} from "../../domains/local-instance/index.js";
export function localProcess(
  signal: AbortSignal,
  environment: NodeJS.ProcessEnv = process.env,
): RunLocalProcess {
  const env = Object.fromEntries(
    Object.entries(environment).filter(
      ([key]) =>
        !/^(COMPOSE_|TF_LOCAL_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$)/i.test(key),
    ),
  );
  const execute: RunLocalProcess = (args, options = {}) =>
    new Promise<ProcessResult>((resolve, reject) => {
      const operationSignal = options.signal ?? signal;
      operationSignal.throwIfAborted();
      const child = spawn("docker", args, {
        shell: false,
        signal: operationSignal,
        env: { ...env, ...options.environment },
        stdio: [options.input ? "pipe" : "ignore", "pipe", "ignore"],
      });
      const chunks: Buffer[] = [];
      let size = 0;
      let failure: Error | undefined;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const abort = (): void => {
        if (!child.killed) child.kill();
        killTimer ??= setTimeout(() => child.kill("SIGKILL"), 5000);
        killTimer.unref();
      };
      operationSignal.addEventListener("abort", abort, { once: true });
      child.stdout!.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > (options.limit ?? 4 * 1024 * 1024)) {
          abort();
          failure = new Error(
            "PROCESS_LIMIT: Docker output exceeded its limit.",
          );
        } else chunks.push(chunk);
      });
      child.once("error", (error) => {
        failure = operationSignal.aborted
          ? error
          : new Error(
              "DOCKER_UNAVAILABLE: Install/start Docker Desktop with Compose v2 and retry.",
            );
      });
      child.once("close", (code) => {
        operationSignal.removeEventListener("abort", abort);
        clearTimeout(killTimer);
        if (operationSignal.aborted) reject(operationSignal.reason);
        else if (failure) reject(failure);
        else resolve({ stdout: Buffer.concat(chunks), code: code ?? 1 });
      });
      child.stdin?.on("error", () => undefined);
      if (options.input) child.stdin!.end(options.input);
    });
  let endpoint: Promise<string> | undefined;
  const localEndpoint = async (
    operationSignal: AbortSignal,
  ): Promise<string> => {
    const configured = environment.DOCKER_HOST;
    const context = configured
      ? undefined
      : await execute(
          ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"],
          { signal: operationSignal },
        );
    if (context && context.code !== 0)
      throw new Error(
        "DOCKER_UNAVAILABLE: Cannot inspect the active Docker context.",
      );
    const host: unknown =
      configured ?? JSON.parse(context!.stdout.toString("utf8").trim());
    if (typeof host !== "string" || !host.startsWith("unix:///"))
      throw new Error(
        "REMOTE_DOCKER_DENIED: Local edition requires a local Unix Docker socket, not SSH/TCP or a remote context.",
      );
    return host;
  };
  return async (args, options) => {
    const operationSignal = options?.signal ?? signal;
    operationSignal.throwIfAborted();
    endpoint ??= localEndpoint(operationSignal);
    // Pin the inspected local socket for every operation, including secret-bearing starts.
    let host: string;
    try {
      host = await endpoint;
    } catch (error) {
      endpoint = undefined;
      throw error;
    }
    const clean = { ...env };
    delete clean.DOCKER_CONTEXT;
    delete clean.DOCKER_HOST;
    return execute(["--host", host, ...args], {
      ...options,
      environment: {
        ...clean,
        ...options?.environment,
        DOCKER_CONTEXT: "",
        DOCKER_HOST: host,
      },
    });
  };
}
