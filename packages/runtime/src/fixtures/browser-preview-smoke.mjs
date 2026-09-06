// Manual acceptance runner against the configured stdio MCP and a signed-in visible project tab.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const projectId = process.env.RJLS_PREVIEW_TEST_PROJECT;
if (!projectId) throw new Error("RJLS_PREVIEW_TEST_PROJECT is required.");
const client = new Client({ name: "codex-preview-acceptance", version: "1" });
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../../dist/stdio-server.js", import.meta.url))], env: Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)), stderr: "inherit" });
async function call(name, args) {
  const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
  if (response.isError) throw new Error(JSON.stringify(response.content));
  return response;
}
try {
  await client.connect(transport);
  await mkdir("/tmp/rjls-preview-evidence", { recursive: true });
  if (process.env.RJLS_PREVIEW_TEST_CANDIDATE) {
    const response = await client.callTool({ name: "get_model_preview", arguments: { projectId, candidateId: process.env.RJLS_PREVIEW_TEST_CANDIDATE, view: "isometric" } }, undefined, { timeout: 120_000 });
    if (response.isError) console.log(JSON.stringify(response.content));
    else { await writeFile("/tmp/rjls-preview-evidence/recovered.png", Buffer.from(response.content.find((c) => c.type === "image").data, "base64")); console.log(JSON.stringify(response.structuredContent)); }
  } else {
  const state = (await call("get_project_state", { projectId })).structuredContent.state;
  const candidate = (await call("propose_model_source", { projectId, parentRevision: state.currentRevision, source: "difference() { union() { cube([60,35,6]); translate([0,0,6]) cube([8,35,24]); } translate([40,17.5,-1]) cylinder(h=8,d=10,$fn=40); }", requestId: crypto.randomUUID(), toolCallId: crypto.randomUUID() })).structuredContent.candidate;
  console.log(JSON.stringify({ phase: "candidate", candidateId: candidate.candidateId }));
  const validated = (await call("validate_and_render", { projectId, candidateId: candidate.candidateId, previewProfile: "standard" })).structuredContent.candidate;
  if (validated.state !== "VALID") throw new Error(JSON.stringify(validated));
  for (const view of ["isometric", "front", "back", "left", "right", "top", "bottom"]) {
    let response;
    for (let retry = 0; retry < 4; retry++) {
      response = await client.callTool({ name: "get_model_preview", arguments: { projectId, candidateId: candidate.candidateId, view } }, undefined, { timeout: 120_000 });
      if (!response.isError) break;
      if (JSON.parse(response.content[0].text).error.code !== "BROWSER_BUSY") break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (response.isError) throw new Error(JSON.stringify(response.content));
    const image = response.content.find((c) => c.type === "image");
    await writeFile(`/tmp/rjls-preview-evidence/${view}.png`, Buffer.from(image.data, "base64"));
    console.log(JSON.stringify({ phase: "image", view, metadata: response.structuredContent }));
  }
  console.log(JSON.stringify({ phase: "complete", candidateId: candidate.candidateId, promoted: false }));
  }
} finally { await client.close(); await transport.close(); }
