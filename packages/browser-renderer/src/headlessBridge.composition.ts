import { createBrowserCadRenderer } from "./browserRenderer.factory.js";
import {
  browserRendererProvenance,
  summarizeStl,
  type BrowserCadRendererOptions,
} from "./features/rendering/index.js";
import {
  headlessRenderInputSchema,
  type HeadlessRenderInput,
  type HeadlessRenderResult,
} from "@theoryfoundry/contracts";
export function createHeadlessRendererBridge(
  options: BrowserCadRendererOptions,
): {
  provenance: typeof browserRendererProvenance;
  cancel(): void;
  render(input: HeadlessRenderInput): Promise<HeadlessRenderResult>;
} {
  const renderer = createBrowserCadRenderer(options);
  let active: AbortController | undefined;
  return {
    provenance: browserRendererProvenance,
    cancel(): void {
      active?.abort();
    },
    async render(raw): Promise<HeadlessRenderResult> {
      if (active) throw new Error("A render is already running.");
      const input = headlessRenderInputSchema.parse(raw);
      const abort = new AbortController();
      active = abort;
      try {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(input.source),
        );
        if (
          Array.from(new Uint8Array(digest), (value) =>
            value.toString(16).padStart(2, "0"),
          ).join("") !== input.sourceHash
        )
          throw new Error("Source hash mismatch.");
        const run = async (): Promise<HeadlessRenderResult> => {
          abort.signal.throwIfAborted();
          if (input.format === "png")
            return {
              ok: true,
              encoded: await renderer.renderModelPng(input, abort.signal),
            };
          const { bytes, diagnostics } =
            input.format === "stl"
              ? await renderer.renderPreview(
                  input.source,
                  input.sourceHash,
                  abort.signal,
                )
              : await renderer.renderOpenScad(
                  input.source,
                  input.format,
                  abort.signal,
                );
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 8192)
            binary += String.fromCharCode(
              ...bytes.subarray(offset, offset + 8192),
            );
          return {
            ok: true,
            encoded: btoa(binary),
            diagnostics,
            ...(input.format === "stl"
              ? { geometry: summarizeStl(bytes) }
              : {}),
          };
        };
        const pending = run();
        if (input.cancelImmediately) abort.abort();
        return await pending;
      } catch (error) {
        const details =
          error instanceof Error ? error : new Error("Rendering failed.");
        return {
          ok: false,
          name: details.name,
          message: details.message.slice(0, 2000),
          ...("failureKind" in details &&
          (details.failureKind === "model" ||
            details.failureKind === "operational")
            ? { failureKind: details.failureKind }
            : {}),
          ...("diagnostics" in details && Array.isArray(details.diagnostics)
            ? { diagnostics: details.diagnostics }
            : {}),
        };
      } finally {
        active = undefined;
      }
    },
  };
}
