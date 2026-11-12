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
      const child = spawn("docker", args, {
        shell: false,
        signal: options.signal ?? signal,
        env: { ...env, ...options.environment },
        stdio: [options.input ? "pipe" : "ignore", "pipe", "ignore"],
      });
      const chunks: Buffer[] = [];
      let size = 0;
      child.stdout!.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > (options.limit ?? 4 * 1024 * 1024)) {
          child.kill();
          reject(new Error("PROCESS_LIMIT: Docker output exceeded its limit."));
        } else chunks.push(chunk);
      });
      child.once("error", () =>
        reject(
          new Error(
            "DOCKER_UNAVAILABLE: Install/start Docker Desktop with Compose v2 and retry.",
          ),
        ),
      );
      child.once("close", (code) =>
        resolve({ stdout: Buffer.concat(chunks), code: code ?? 1 }),
      );
      child.stdin?.on("error", () => undefined);
      if (options.input) child.stdin!.end(options.input);
    });
  let endpoint: Promise<string> | undefined;
  const localEndpoint = async (): Promise<string> => {
    const configured = environment.DOCKER_HOST;
    const context = configured
      ? undefined
      : await execute([
          "context",
          "inspect",
          "--format",
          "{{json .Endpoints.docker.Host}}",
        ]);
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
    endpoint ??= localEndpoint();
    // Pin the inspected local socket for every operation, including secret-bearing starts.
    const host = await endpoint;
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
