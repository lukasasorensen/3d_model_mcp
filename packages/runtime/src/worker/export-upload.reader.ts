import { CAD_LIMITS, WORKER_EXPORT_LIMITS, completeWorkerExportSchema } from "@theoryfoundry/contracts";
import { readWorkerBody } from "./request-body.util.js";

/** Bound the wire body before multipart decoding, including unknown fields and headers. */
export async function readWorkerExportUpload(request: Request, readMs: number = WORKER_EXPORT_LIMITS.readMs) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new SyntaxError("Multipart completion is required.");
  const body = await readWorkerBody(request, WORKER_EXPORT_LIMITS.requestBytes, readMs);
  let form: FormData;
  try { form = await new Response(new Uint8Array(body), { headers: { "content-type": contentType } }).formData(); }
  catch { throw new SyntaxError("Invalid multipart completion."); }
  const names = [...form.keys()];
  if (names.some(name => !["metadata", "artifact"].includes(name)) || form.getAll("metadata").length !== 1 || form.getAll("artifact").length > 1) {
    throw new SyntaxError("Unexpected or duplicate multipart fields.");
  }
  const raw = form.get("metadata");
  if (typeof raw !== "string") throw new SyntaxError("JSON metadata is required.");
  if (Buffer.byteLength(raw) > WORKER_EXPORT_LIMITS.metadataBytes) throw new RangeError("Metadata exceeds its limit.");
  const parsed = completeWorkerExportSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new SyntaxError("Invalid completion metadata.");
  const artifact = form.get("artifact");
  if (typeof artifact === "string" || (parsed.data.outcome === "COMPLETED") !== (artifact !== null)) {
    throw new SyntaxError("Success requires one binary artifact; failure requires none.");
  }
  if (artifact && (!artifact.size || artifact.size > (parsed.data.format === "stl" ? CAD_LIMITS.previewBytes : CAD_LIMITS.exportBytes))) {
    throw new RangeError("Artifact exceeds its format limit or is empty.");
  }
  return { metadata: parsed.data, ...(artifact ? { bytes: new Uint8Array(await artifact.arrayBuffer()) } : {}) };
}
