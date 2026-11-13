import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { saveCadOutput } from "../../../../src/features/agent-cli/services/cadCommand.service.js";
void test("exports stay on the selected instance, verify bytes and refuse overwriting existing output", async () => {
  const bytes = Buffer.from("STL fixture");
  let delivered = bytes;
  const server = createServer((_req, response) => {
    response.end(delivered);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const root = await mkdtemp(join(tmpdir(), "tf-artifact-"));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const receipt = {
    exportId: "export",
    projectId: "project",
    revision: "revision",
    sourceHash: "a".repeat(64),
    format: "stl",
    mimeType: "model/stl",
    filename: "part.stl",
    hash: createHash("sha256").update(bytes).digest("hex"),
    byteSize: bytes.length,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    downloadExpiresAt: new Date(Date.now() + 60000).toISOString(),
    downloadUrl: `${origin}/v1/exports/export/download?token=private`,
  };
  const signal = new AbortController().signal;
  const output = join(root, "part.stl");
  try {
    await saveCadOutput(
      { content: [], structuredContent: { export: receipt } },
      output,
      origin,
      signal,
    );
    assert.deepEqual(await readFile(output), bytes);
    await assert.rejects(
      saveCadOutput(
        { content: [], structuredContent: { export: receipt } },
        output,
        origin,
        signal,
      ),
      /EEXIST/,
    );
    delivered = Buffer.from("corrupt");
    await assert.rejects(
      saveCadOutput(
        { content: [], structuredContent: { export: receipt } },
        join(root, "corrupt.stl"),
        origin,
        signal,
      ),
      /ARTIFACT_INTEGRITY/,
    );
    await assert.rejects(
      saveCadOutput(
        {
          content: [],
          structuredContent: {
            export: {
              ...receipt,
              downloadUrl: "https://example.com/v1/exports/export/download",
            },
          },
        },
        output,
        origin,
        signal,
      ),
      /ARTIFACT_ORIGIN/,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
