import { getConfiguredCadRuntime } from "@rjls/runtime";
import { createArtifactGetHandler } from "@/lib/artifact-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createArtifactGetHandler(() => getConfiguredCadRuntime().catch(() => undefined));
