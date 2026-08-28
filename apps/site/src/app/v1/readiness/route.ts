import { probeSystemReadiness } from "@rjls/runtime";
import { createReadinessHandler } from "@/lib/readiness-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createReadinessHandler(probeSystemReadiness);
