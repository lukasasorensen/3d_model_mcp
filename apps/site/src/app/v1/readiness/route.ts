import { probeSystemReadiness } from "@theoryfoundry/runtime";
import { createReadinessHandler } from "../../../features/readiness/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createReadinessHandler(probeSystemReadiness);
