"use client";
import { useEffect, useState } from "react";
import type { BufferGeometry } from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { useBrowserRenderer } from "../../../browser-rendering/browser/index";

const BYTE_LIMIT = 10 * 1024 * 1024;
const OPERAND_TRIANGLE_LIMIT = 250_000;
const TOTAL_TRIANGLE_LIMIT = 500_000;
const TOTAL_TRIANGLE_ERROR =
  "The object preview exceeds its total triangle limit.";

export function useObjectPreview(
  sources: ReadonlyMap<string, string> | undefined,
  visibleObjects: readonly { fileId: string }[],
  ready: boolean,
): {
  meshes: ReadonlyMap<string, BufferGeometry> | undefined;
  error: string | undefined;
} {
  const renderer = useBrowserRenderer();
  const [preview, setPreview] = useState<{
    sources: ReadonlyMap<string, string>;
    meshes?: ReadonlyMap<string, BufferGeometry>;
    error?: string;
  }>();

  useEffect(() => {
    if (!sources || !ready) return;
    const abort = new AbortController();
    const owned = new Map<string, BufferGeometry>();
    const meshes = new Map<string, BufferGeometry>();
    const loader = new STLLoader();
    let triangles = 0;

    async function load(entries: ReadonlyMap<string, string>): Promise<void> {
      for (const [id, source] of entries) {
        let mesh = owned.get(source);
        if (!mesh) {
          const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(source),
          );
          const hash = Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("");
          abort.signal.throwIfAborted();
          const bytes =
            renderer.cachedPreview(hash) ??
            (await renderer.renderPreview(source, hash, abort.signal)).bytes;
          abort.signal.throwIfAborted();
          if (bytes.byteLength > BYTE_LIMIT)
            throw new Error("An object preview exceeds its byte limit.");
          mesh = loader.parse(new Uint8Array(bytes).buffer);
          owned.set(source, mesh);
          const positions = mesh.getAttribute("position");
          const count = positions.count / 3;
          if (
            !Number.isInteger(count) ||
            count <= 0 ||
            count > OPERAND_TRIANGLE_LIMIT ||
            !positions.array.every(Number.isFinite)
          )
            throw new Error("An object has unsupported preview geometry.");
          mesh.computeVertexNormals();
        }
        triangles += mesh.getAttribute("position").count / 3;
        if (triangles > TOTAL_TRIANGLE_LIMIT)
          throw new Error(TOTAL_TRIANGLE_ERROR);
        meshes.set(id, mesh);
      }
      setPreview({ sources: entries, meshes });
    }

    const dispose = (): void => {
      for (const geometry of owned.values()) geometry.dispose();
      owned.clear();
    };
    void load(sources).catch((failure: unknown) => {
      if (abort.signal.aborted) return;
      dispose();
      setPreview({
        sources,
        error:
          failure instanceof Error
            ? failure.message
            : "Object geometry could not be previewed.",
      });
    });
    return (): void => {
      abort.abort();
      dispose();
    };
  }, [ready, renderer, sources]);

  if (!ready || !preview || preview.sources !== sources)
    return { meshes: undefined, error: undefined };
  const { meshes, error } = preview;
  if (meshes) {
    // Shared geometry is loaded once, but each visible object draws its own triangles.
    let drawnTriangles = 0;
    for (const object of visibleObjects) {
      const mesh = meshes.get(object.fileId);
      if (mesh) drawnTriangles += mesh.getAttribute("position").count / 3;
      if (drawnTriangles > TOTAL_TRIANGLE_LIMIT)
        return { meshes: undefined, error: TOTAL_TRIANGLE_ERROR };
    }
  }
  return { meshes, error };
}
