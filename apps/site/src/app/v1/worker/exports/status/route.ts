import { handleWorkerExportRequest } from "@theoryfoundry/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request): Promise<Response> {
  return handleWorkerExportRequest(request, "status");
}
