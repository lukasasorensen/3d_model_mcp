import { CAD_LIMITS, projectIdSchema, sessionIdSchema, opaqueIdSchema } from "@rjls/contracts";
import { ModelExportsRepository } from "@rjls/runtime";
import { getProjectDatabase, createModelExportService, CadDomainError, remoteMcpEnabled } from "@rjls/runtime";
import { authenticateRequest, isPolicyResponse, jsonError, NO_STORE_HEADERS, requireSameOrigin } from "./route-policy";
import { localMcpBridgeEnabled } from "./local-mcp-browser-routes";
export function exportRoute(action: "claim" | "complete") {
    return async (request: Request, context: {
        params: Promise<{
            projectId: string;
        }>;
    }) => {
        const origin = requireSameOrigin(request);
        if (origin)
            return origin;
        const user = await authenticateRequest(request);
        if (isPolicyResponse(user))
            return user;
        const project = projectIdSchema.safeParse((await context.params).projectId), session = sessionIdSchema.safeParse(request.headers.get("x-rjls-session-id"));
        if (!project.success || !session.success)
            return jsonError("INVALID_REQUEST", 400);
        try {
            const database = getProjectDatabase();
            if (action === "claim") {
                const modes = [...(remoteMcpEnabled() ? ["remote-mcp"] : []), ...(localMcpBridgeEnabled() ? ["local-mcp"] : []), "chat"];
                const job = await new ModelExportsRepository(database.pool, user.id).claim(project.data, session.data, modes);
                return job ? Response.json({ job }, { headers: NO_STORE_HEADERS }) : new Response(null, { status: 204, headers: NO_STORE_HEADERS });
            }
            const id = opaqueIdSchema.parse(request.headers.get("x-export-id"));
            const token = request.headers.get("x-export-token") ?? "", sourceHash = request.headers.get("x-source-hash") ?? "";
            if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(sourceHash))
                return jsonError("INVALID_REQUEST", 400);
            if (request.headers.get("x-export-failed") === "true") {
                await createModelExportService(database).fail(user.id, project.data, id, session.data, token, sourceHash);
                return Response.json({ accepted: true }, { headers: NO_STORE_HEADERS });
            }
            const pending = await new ModelExportsRepository(database.pool, user.id).get(id);
            if (pending.project_id !== project.data || pending.session_id !== session.data || pending.state !== "PENDING")
                return jsonError("EXPORT_UNAVAILABLE", 409);
            const reader = request.body?.getReader();
            if (!reader)
                return jsonError("INVALID_REQUEST", 400);
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    size += value.byteLength;
                    if (size > CAD_LIMITS.exportBytes)
                        throw new RangeError();
                    chunks.push(value);
                }
            }
            finally {
                await reader.cancel().catch(() => undefined);
                reader.releaseLock();
            }
            await createModelExportService(database).complete(user.id, project.data, id, session.data, token, sourceHash, Buffer.concat(chunks));
            return Response.json({ accepted: true }, { headers: NO_STORE_HEADERS });
        }
        catch (error) {
            if (error instanceof RangeError)
                return jsonError("ARTIFACT_LIMIT_EXCEEDED", 413);
            if (error instanceof CadDomainError) {
                console.error("Export operation failed", { code: error.code, message: error.message });
                return jsonError(error.code, 409, error.message);
            }
            return jsonError("EXPORT_UNAVAILABLE", 503);
        }
    };
}
export async function downloadExport(request: Request, context: {
    params: Promise<{
        exportId: string;
    }>;
}) {
    try {
        const id = opaqueIdSchema.parse((await context.params).exportId), token = new URL(request.url).searchParams.get("token") ?? "";
        if (!/^[a-f0-9]{64}$/.test(token))
            return jsonError("EXPORT_UNAVAILABLE", 404);
        const { metadata, bytes } = await createModelExportService(getProjectDatabase()).download(id, token);
        return new Response(new Uint8Array(bytes), { headers: { ...NO_STORE_HEADERS, "content-type": metadata.mimeType, "content-length": String(metadata.byteSize), "content-disposition": `attachment; filename="${metadata.filename}"`, "x-content-sha256": metadata.hash, "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" } });
    }
    catch {
        return jsonError("EXPORT_UNAVAILABLE", 404);
    }
}
