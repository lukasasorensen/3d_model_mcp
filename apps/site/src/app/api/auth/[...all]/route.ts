import { handleAuthRequest } from "@theoryfoundry/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: Request): Promise<Response> {
  return handleAuthRequest(request);
}

export { handler as GET, handler as POST };
