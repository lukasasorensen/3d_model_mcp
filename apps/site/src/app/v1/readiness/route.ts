import {
  localEditionOrigin,
  probeSystemReadiness,
} from "@theoryfoundry/runtime";
import { createReadinessHandler } from "../../../features/readiness/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createReadinessHandler(probeSystemReadiness);
export async function GET(): Promise<Response> {
  const response = await handler();
  if (localEditionOrigin() && process.env.THEORYFOUNDRY_LOCAL_INSTANCE_ID)
    response.headers.set(
      "x-theoryfoundry-local-instance",
      process.env.THEORYFOUNDRY_LOCAL_INSTANCE_ID,
    );
  return response;
}
