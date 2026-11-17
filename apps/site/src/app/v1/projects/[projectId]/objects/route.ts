import { withConfiguredCadRuntime } from "@theoryfoundry/runtime";
import { authenticateRequest } from "@/authentication.composition";
import { createObjectEditingHandlers } from "../../../../../features/object-editing/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, POST } = createObjectEditingHandlers({
  authenticate: authenticateRequest,
  withRuntime: withConfiguredCadRuntime,
});
