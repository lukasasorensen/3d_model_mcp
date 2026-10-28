import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { getAuth } from "./auth.composition.js";
import { remoteMcpEnabled } from "./shared/utils/remoteMcpPolicy.util.js";
export function oauthServerMetadata(
  request: Request,
): Promise<Response> | Response {
  if (!remoteMcpEnabled()) return new Response(null, { status: 404 });
  return oauthProviderAuthServerMetadata(getAuth())(request);
}
