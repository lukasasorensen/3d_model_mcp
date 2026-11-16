import { withConfiguredCadRuntime } from "@theoryfoundry/runtime";
import { authenticateRequest } from "@/authentication.composition";
import { createParameterControlsHandlers } from "../../../../../features/parameter-controls/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, POST } = createParameterControlsHandlers({
  authenticate: authenticateRequest,
  withRuntime: withConfiguredCadRuntime,
});
