import { withConfiguredCadRuntime } from "@theoryfoundry/runtime";
import { authenticateRequest } from "@/authentication.composition";
import { createWorkingModelHandler } from "../../../../../../features/working-model/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createWorkingModelHandler(
  {
    authenticate: authenticateRequest,
    withRuntime: withConfiguredCadRuntime,
  },
  "save",
);
