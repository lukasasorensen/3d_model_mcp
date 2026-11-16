import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  createCadToolCatalog,
  CAD_LIMITS,
  exportReceiptSchema,
  previewMetadataSchema,
} from "@theoryfoundry/contracts";
import { readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import type {
  AgentCapabilities,
  AgentCommand,
  AgentConnection,
} from "../../../domains/agent-cli/index.js";
export async function saveCadOutput(
  result: CallToolResult,
  output: string,
  server: string,
  signal: AbortSignal,
): Promise<void> {
  const image = result.content.find((part) => part.type === "image");
  let bytes: Buffer;
  if (image) {
    if (image.mimeType !== "image/png")
      throw new Error("ARTIFACT_INVALID: Expected PNG output.");
    bytes = Buffer.from(image.data, "base64");
    const metadata = previewMetadataSchema.parse(result.structuredContent);
    if (createHash("sha256").update(bytes).digest("hex") !== metadata.imageHash)
      throw new Error("ARTIFACT_INTEGRITY: PNG does not match its metadata.");
    if (
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new Error("ARTIFACT_INVALID: Invalid PNG output.");
  } else {
    const receipt = exportReceiptSchema.parse(result.structuredContent?.export);
    const url = new URL(receipt.downloadUrl);
    if (
      url.origin !== server ||
      !/^\/v1\/exports\/[^/]+\/download$/.test(url.pathname) ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new Error(
        "ARTIFACT_ORIGIN: Export download must stay on the configured instance.",
      );
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
    });
    if (!response.ok)
      throw new Error("ARTIFACT_UNAVAILABLE: Request a fresh export receipt.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body?.getReader();
    try {
      while (reader) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > receipt.byteSize)
          throw new Error("ARTIFACT_INTEGRITY: Download exceeds its receipt.");
        chunks.push(part.value);
      }
    } finally {
      await reader?.cancel().catch(() => undefined);
    }
    bytes = Buffer.concat(chunks);
    if (
      bytes.length !== receipt.byteSize ||
      createHash("sha256").update(bytes).digest("hex") !== receipt.hash
    )
      throw new Error(
        "ARTIFACT_INTEGRITY: Download does not match its receipt.",
      );
  }
  await writeFile(output, bytes, { flag: "wx", mode: 0o600 });
}
export async function executeCadCommand(
  command: AgentCommand,
  connection: AgentConnection,
  capabilities: AgentCapabilities,
): Promise<Record<string, unknown>> {
  const catalog = createCadToolCatalog("local-worker");
  const definition = command.tool
    ? Object.entries(catalog).find(([name]) => name === command.tool)?.[1]
    : undefined;
  let input: Record<string, unknown> | undefined;
  if (command.command === "call") {
    if (!definition)
      throw new Error(
        "UNKNOWN_TOOL: Run tools to inspect the supported CAD tool schemas.",
      );
    if ((await stat(command.input!)).size > CAD_LIMITS.sourceBytes + 16384)
      throw new Error("INPUT_LIMIT: CAD request file is too large.");
    input = definition.inputSchema.parse(
      JSON.parse(await readFile(command.input!, "utf8")),
    );
    if (
      command.output &&
      !["get_model_preview", "export_model"].includes(command.tool!)
    )
      throw new Error(
        "USAGE: --output applies only to PNG previews and exports.",
      );
  }
  const client = new Client({
    name: "theoryfoundry-skill-cli",
    version: "1.0.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      capabilities.entry,
      "serve",
      "--server",
      connection.server,
      "--account",
      connection.account,
      ...(connection.allowLoopbackHttp ? ["--allow-loopback-http"] : []),
    ],
    stderr: "pipe",
  });
  try {
    capabilities.signal.throwIfAborted();
    await client.connect(transport, {
      signal: capabilities.signal,
      timeout: 60000,
    });
    if (command.command === "tools")
      return {
        tools: (await client.listTools({}, { signal: capabilities.signal }))
          .tools,
      };
    const result = (await client.callTool(
      { name: command.tool!, arguments: input! },
      undefined,
      { signal: capabilities.signal, timeout: 120000 },
    )) as CallToolResult;
    if (result.isError)
      return {
        ...result,
        content: result.content.filter((part) => part.type === "text"),
      };
    if (command.output)
      await saveCadOutput(
        result,
        command.output,
        connection.server,
        capabilities.signal,
      );
    return {
      isError: false,
      result: result.structuredContent,
      content: result.content.filter((part) => part.type === "text"),
      ...(command.output ? { file: command.output } : {}),
      ...(command.tool === "get_model_preview" && !command.output
        ? {
            next: "Repeat with --output /absolute/path.png to inspect the preview.",
          }
        : {}),
    };
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }
}
