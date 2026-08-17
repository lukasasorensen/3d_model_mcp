import type { ConfiguredCadRuntime } from "@rjls/runtime";

const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export function createReadinessHandler(getRuntime: () => Promise<Pick<ConfiguredCadRuntime, "probeReadiness"> | undefined>) {
  return async function GET(): Promise<Response> {
    const configured = await getRuntime().catch(() => undefined);
    if (!configured) return Response.json({ readiness: { status: "unavailable", message: "The local CAD runtime is not configured." } }, { status: 503, headers });
    try {
      const readiness = await configured.probeReadiness();
      return Response.json({ readiness }, { headers });
    } catch {
      return Response.json({ readiness: { status: "unavailable", message: "The renderer toolchain is unavailable." } }, { status: 503, headers });
    }
  };
}
