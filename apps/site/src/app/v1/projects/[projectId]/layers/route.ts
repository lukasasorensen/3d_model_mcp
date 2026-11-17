import { withConfiguredCadRuntime } from "@theoryfoundry/runtime";
import { authenticateRequest } from "@/authentication.composition";
import { createObjectLayersHandlers } from "../../../../../features/object-layers/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, POST } = createObjectLayersHandlers({
  authenticate: authenticateRequest,
  withRuntime: withConfiguredCadRuntime,
});
