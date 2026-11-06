import {
  createConnectionProvider,
  testConnectionProvider,
  type CadChatProvider,
} from "@theoryfoundry/gateway";
import {
  AI_LIMITS,
  AiConnectionError,
  companionRegistrationSchema,
  companionClaimSchema,
  companionLeaseSchema,
  companionCompletionSchema,
  safeAiError,
  type ChatRequest,
} from "@theoryfoundry/contracts";
import {
  AiConnectionsRepository,
  AiCompanionRelayRepository,
  createPublicAiFetch,
  discoverHostedModels,
} from "./infrastructure/ai/index.js";
import {
  AiConnectionsWorkflow,
  handleAiSettings,
  readAiJson,
} from "./features/ai/index.js";
import { getProjectDatabase } from "./database.composition.js";
import { getAuthenticatedUser } from "./auth.composition.js";
import { authenticateRemoteMcp } from "./remoteAuth.composition.js";

function configuredAi(): {
  store: AiConnectionsRepository;
  relay: AiCompanionRelayRepository;
  workflow: AiConnectionsWorkflow;
} {
  const { pool } = getProjectDatabase();
  const store = new AiConnectionsRepository(pool);
  const relay = new AiCompanionRelayRepository(pool);
  const workflow = new AiConnectionsWorkflow(
    store,
    relay,
    {
      provider: createConnectionProvider,
      test: testConnectionProvider,
      list: discoverHostedModels,
    },
    createPublicAiFetch,
  );
  return { store, relay, workflow };
}
export async function resolveChatProvider(
  owner: string,
  request: ChatRequest,
  signal: AbortSignal,
): Promise<CadChatProvider> {
  return configuredAi().workflow.provider(owner, request, signal);
}
export async function handleAiApiRequest(
  request: Request,
  realAiAllowed: (owner: string) => Promise<boolean>,
): Promise<Response> {
  const headers = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
  const json = (value: unknown, status = 200): Response =>
    Response.json(value, { status, headers });
  const parts = new URL(request.url).pathname
    .replace(/^\/v1\/ai\//, "")
    .split("/");
  const allowedOrigin =
    process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000";
  try {
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== allowedOrigin)
      return json({ error: { message: "Origin denied." } }, 403);
    if (parts[0] !== "companion") {
      if (request.method !== "GET" && origin !== allowedOrigin)
        return json({ error: { message: "Origin denied." } }, 403);
      const user = await getAuthenticatedUser(request.headers);
      if (!user)
        return json(
          { error: { message: "Sign in to manage AI connections." } },
          401,
        );
      return handleAiSettings(request, user.id, parts, configuredAi());
    }
    if (request.method !== "POST" || parts.length !== 2)
      return json({ error: { message: "Not found." } }, 404);
    const owner = await authenticateRemoteMcp(request);
    const secret = request.headers.get("x-theoryfoundry-companion-key") ?? "";
    if (!/^[a-f0-9]{64}$/.test(secret))
      throw new AiConnectionError("AI_AUTHENTICATION");
    const { relay } = configuredAi();
    const raw = await readAiJson(request, AI_LIMITS.resultBytes + 4096);
    if (parts[1] === "register") {
      const data = companionRegistrationSchema.parse(raw);
      await relay.register(owner, data, secret);
      return json({ ok: true });
    }
    if (!(await realAiAllowed(owner)))
      return json(
        {
          error: {
            code: "CHAT_DISABLED",
            message: "Real AI chat is disabled.",
          },
        },
        404,
      );
    if (parts[1] === "claim") {
      const data = companionClaimSchema.parse(raw);
      await relay.authorize(owner, data.companionId, secret);
      return json({
        job: await relay.claim(owner, data.companionId, request.signal),
      });
    }
    if (parts[1] === "heartbeat") {
      const data = companionLeaseSchema.parse(raw);
      await relay.authorize(owner, data.companionId, secret);
      return json({
        active: await relay.heartbeat(
          owner,
          data.companionId,
          data.jobId,
          data.lease,
        ),
      });
    }
    if (parts[1] === "complete") {
      const data = companionCompletionSchema.parse(raw);
      await relay.authorize(owner, data.companionId, secret);
      await relay.complete(
        owner,
        data.companionId,
        data.jobId,
        data.lease,
        data.output,
      );
      return json({ ok: true });
    }
    return json({ error: { message: "Not found." } }, 404);
  } catch (error) {
    const safe = safeAiError(error);
    return json(
      { error: { code: safe.code, message: safe.message } },
      safe.code === "AI_AUTHENTICATION" ? 401 : 503,
    );
  }
}
