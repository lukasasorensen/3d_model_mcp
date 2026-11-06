import { parseArgs } from "node:util";
import { hostname } from "node:os";
import { createWorkerAuthentication } from "@theoryfoundry/worker-auth";
import { AiConnectionError, safeAiError } from "@theoryfoundry/contracts";
import { parseWorkerCommand } from "./features/cli/index.js";
import { serveAiCompanion } from "./features/ai/index.js";
import {
  companionCredentials,
  promptLocalAiToken,
  createCompanionApi,
  createLocalAiModels,
} from "./infrastructure/ai/index.js";

export async function runAiCompanion(args: string[]): Promise<number> {
  const help =
    "Use ai serve|doctor --server <origin> --account <id> [--provider ollama|openai-compatible] [--endpoint <local URL>] [--name <name>] [--configure-token]. Use login first. Node 24 and OS credential storage are required.\n";
  if (!args.length || args.includes("--help")) {
    process.stdout.write(help);
    return 0;
  }
  const stop = new AbortController();
  const abort = (): void => stop.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    if (
      process.versions.node.split(".")[0] !== "24" ||
      !["serve", "doctor"].includes(args[0]!)
    )
      throw new AiConnectionError("AI_CONFIGURATION");
    const { values, tokens } = parseArgs({
      args: args.slice(1),
      strict: true,
      allowPositionals: false,
      tokens: true,
      options: {
        server: { type: "string" },
        account: { type: "string" },
        provider: { type: "string", default: "ollama" },
        endpoint: { type: "string" },
        name: { type: "string", default: hostname() },
        "allow-loopback-http": { type: "boolean" },
        "configure-token": { type: "boolean" },
      },
    });
    const names = tokens
      .filter((token) => token.kind === "option")
      .map((token) => token.name);
    if (
      new Set(names).size !== names.length ||
      !values.server ||
      !values.account ||
      !["ollama", "openai-compatible"].includes(values.provider!)
    )
      throw new AiConnectionError("AI_CONFIGURATION");
    const parsed = parseWorkerCommand([
      "serve",
      "--server",
      values.server,
      "--account",
      values.account,
      ...(values["allow-loopback-http"] ? ["--allow-loopback-http"] : []),
    ]);
    if (parsed.command !== "serve")
      throw new AiConnectionError("AI_CONFIGURATION");
    const url = new URL(
      values.endpoint ??
        (values.provider === "ollama"
          ? "http://127.0.0.1:11434"
          : "http://127.0.0.1:1234/v1"),
    );
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !values.name?.trim() ||
      values.name.length > 100
    )
      throw new AiConnectionError("AI_CONFIGURATION");
    const endpoint = url.toString().replace(/\/$/, "");
    const identity = JSON.stringify([
      values.server,
      values.account,
      values.provider,
      endpoint,
      values.name,
    ]);
    const credentials = await companionCredentials(
      identity,
      values["configure-token"] ?? false,
      () => promptLocalAiToken(stop.signal),
    );
    const models = createLocalAiModels({
      provider: values.provider as "ollama" | "openai-compatible",
      endpoint,
      ...("token" in credentials && typeof credentials.token === "string"
        ? { token: credentials.token }
        : {}),
    });
    const auth = createWorkerAuthentication(parsed.target.server, {
      allowLoopbackHttp: parsed.target.allowLoopbackHttp,
    });
    const api = createCompanionApi(
      values.server,
      credentials.secret,
      async (signal) => (await auth.accessToken(values.account!, signal)).token,
    );
    if (args[0] === "doctor") {
      const result = await models.execute(
        { operation: "models" },
        AbortSignal.any([stop.signal, AbortSignal.timeout(30_000)]),
      );
      if ("error" in result) throw new AiConnectionError(result.error);
      await auth.accessToken(values.account, stop.signal);
      process.stdout.write(
        `Hosted authentication passed. Local models: ${"models" in result ? result.models.join(", ") : "none"}\n`,
      );
    } else
      await serveAiCompanion(
        { id: credentials.id, name: values.name, provider: values.provider! },
        api,
        models,
        stop.signal,
        (text) => process.stderr.write(text),
      );
    return 0;
  } catch (error) {
    if (stop.signal.aborted) return 0;
    process.stderr.write(`${safeAiError(error).message}\n${help}`);
    return 1;
  } finally {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
  }
}
