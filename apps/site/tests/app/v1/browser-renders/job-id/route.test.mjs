import assert from "node:assert/strict";
import { CAD_LIMITS } from "@theoryfoundry/contracts";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("hosted completions stop oversized streams before parsing or persistence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "render-body-limit-"));
  try {
    const output = join(directory, "route.mjs");
    await build({
      entryPoints: [
        fileURLToPath(
          new URL(
            "../../../../../src/app/v1/browser-renders/[jobId]/route.ts",
            import.meta.url,
          ),
        ),
      ],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: output,
      plugins: [
        {
          name: "authentication-and-runtime",
          setup(builder) {
            builder.onResolve(
              { filter: authenticationModulePattern() },
              () => ({ path: "auth", namespace: "fixture" }),
            );
            builder.onResolve({ filter: runtimeModulePattern() }, () => ({
              path: "runtime",
              namespace: "fixture",
            }));
            builder.onLoad(
              { filter: anyFixtureModulePattern(), namespace: "fixture" },
              ({ path }) => ({
                contents:
                  path === "auth"
                    ? 'export async function authenticateRequest(){return {id:"owner"}}'
                    : 'export class BrowserRenderCompletionError extends Error {} export async function withConfiguredCadRuntime(){throw new Error("Unexpected persistence")}',
              }),
            );
          },
        },
      ],
    });
    const { POST } = await import(pathToFileURL(output).href);
    for (const length of [undefined, "2", String(1024 * 1024)]) {
      let consumed = 0;
      let cancelled = false;
      const stream = new ReadableStream({
        pull(controller) {
          consumed += 4096;
          controller.enqueue(new Uint8Array(4096).fill(32));
          if (consumed >= 1024 * 1024) controller.close();
        },
        cancel() {
          cancelled = true;
        },
      });
      const request = new Request(
        "http://localhost:3000/v1/browser-renders/job-1",
        {
          method: "POST",
          headers: {
            origin:
              process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ??
              "http://localhost:3000",
            ...(length === undefined ? {} : { "content-length": length }),
          },
          body: stream,
          duplex: "half",
        },
      );
      const response = await POST(request, {
        params: Promise.resolve({ jobId: "job-1" }),
      });
      assert.equal(response.status, 413);
      assert.ok(
        consumed <= CAD_LIMITS.browserRenderCompletionBytes + 8192,
        `consumed ${consumed}`,
      );
      if (length !== String(1024 * 1024)) assert.equal(cancelled, true);
      await stream.cancel();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function authenticationModulePattern() {
  return /^@\/authentication.composition$/;
}

function runtimeModulePattern() {
  return /^@theoryfoundry\/runtime$/;
}

function anyFixtureModulePattern() {
  return /.*/;
}
