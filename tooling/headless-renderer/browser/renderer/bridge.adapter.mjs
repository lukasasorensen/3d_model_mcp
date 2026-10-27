/* global Worker, window */
import {
  createBrowserCadRenderer,
  browserRendererProvenance,
  summarizeStl,
} from "@theoryfoundry/browser-renderer";

const { renderOpenScad, renderPreview, renderModelPng } =
  createBrowserCadRenderer({
    createWorker: () =>
      new Worker(new URL("./openscad-worker.js", import.meta.url), {
        type: "module",
        name: "openscad-render",
      }),
    assetsOrigin: () => window.location.origin,
  });

let active;
globalThis.cadProof = {
  provenance: browserRendererProvenance,
  cancel() {
    active?.abort();
  },
  async render({
    source,
    sourceHash,
    format,
    view = "isometric",
    cancelImmediately = false,
  }) {
    if (active) throw new Error("A proof render is already running.");
    active = new AbortController();
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(source),
      );
      if (
        Array.from(new Uint8Array(digest), (value) =>
          value.toString(16).padStart(2, "0"),
        ).join("") !== sourceHash
      )
        throw new Error("Source hash mismatch.");
      let pending;
      if (format === "png") {
        pending = renderModelPng(
          { source, sourceHash, view },
          active.signal,
        ).then((png) => ({ encoded: png }));
      } else {
        pending = (
          format === "stl"
            ? renderPreview(source, sourceHash, active.signal)
            : renderOpenScad(source, format, active.signal)
        ).then(({ bytes, diagnostics }) => {
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 8192)
            binary += String.fromCharCode(
              ...bytes.subarray(offset, offset + 8192),
            );
          return {
            encoded: btoa(binary),
            diagnostics,
            ...(format === "stl" ? { geometry: summarizeStl(bytes) } : {}),
          };
        });
      }
      if (cancelImmediately) active.abort();
      return { ok: true, ...(await pending) };
    } catch (error) {
      return {
        ok: false,
        name: error.name,
        message: error.message,
        failureKind: error.failureKind,
        diagnostics: error.diagnostics,
      };
    } finally {
      active = undefined;
    }
  },
};
