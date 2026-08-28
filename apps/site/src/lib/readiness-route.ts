import type { ConfiguredCadRuntime } from "@rjls/runtime";
import { NO_STORE_HEADERS } from "./route-policy";

type Readiness = Awaited<ReturnType<ConfiguredCadRuntime["probeReadiness"]>>;

export function createReadinessHandler(probeReadiness: () => Promise<Readiness>) {
  return async function GET(): Promise<Response> {
    try {
      const readiness = await probeReadiness();
      return Response.json({ readiness }, { headers: NO_STORE_HEADERS });
    } catch {
      return Response.json({ readiness: { status: "unavailable", message: "The local CAD runtime is unavailable." } }, { status: 503, headers: NO_STORE_HEADERS });
    }
  };
}
