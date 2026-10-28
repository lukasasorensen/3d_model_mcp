import { handleWorkerValidationRequest } from "@theoryfoundry/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return handleWorkerValidationRequest(request, "begin");
}
