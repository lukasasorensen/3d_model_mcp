import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
  WORKER_OAUTH_CLIENT_ID,
  WORKER_OAUTH_CALLBACK,
} from "@theoryfoundry/contracts";
/** The provider permits native loopback port variance; this worker uses one exact callback. */
export function createWorkerOAuthPolicy(): BetterAuthPlugin {
  return {
    id: "theoryfoundry-worker-callback",
    hooks: {
      before: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (context) => {
            const values: unknown[] = [context.query, context.body];
            if (context.body && typeof context.body.oauth_query === "string") {
              values.push(
                Object.fromEntries(
                  new URLSearchParams(context.body.oauth_query),
                ),
              );
            }
            for (const value of values) {
              if (
                value &&
                typeof value === "object" &&
                "client_id" in value &&
                value.client_id === WORKER_OAUTH_CLIENT_ID &&
                "redirect_uri" in value &&
                value.redirect_uri !== WORKER_OAUTH_CALLBACK
              ) {
                throw new APIError("BAD_REQUEST", { error: "invalid_request" });
              }
            }
          }),
        },
      ],
    },
  };
}
