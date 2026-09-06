// Protocol fixture: verifies binary content survives the real stdio transport.
import { connectCadMcpStdio } from "@rjls/mcp";
import { pngFixture } from "../test-support/preview-png.mjs";
const server = await connectCadMcpStdio({}, { previewService: { async getPreview(input) {
  return { metadata: { projectId: input.projectId, revisionId: "revision", sourceHash: "a".repeat(64), imageHash: "b".repeat(64), width: 768, height: 768, view: input.view }, png: pngFixture() };
} } });
process.stdin.once("end", () => { void server.close(); });
