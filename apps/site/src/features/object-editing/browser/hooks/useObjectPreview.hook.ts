"use client";
import { useEffect, useState } from "react";
import type { BufferGeometry } from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { useBrowserRenderer } from "../../../browser-rendering/browser/index";

const BYTE_LIMIT = 10 * 1024 * 1024;
const OPERAND_TRIANGLE_LIMIT = 250_000;
const TOTAL_TRIANGLE_LIMIT = 500_000;

export function useObjectPreview(
  sources: ReadonlyMap<string, string> | undefined,
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
          throw new Error(
            "The object preview exceeds its total triangle limit.",
          );
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

  return {
    meshes: ready && preview?.sources === sources ? preview?.meshes : undefined,
    error: ready && preview?.sources === sources ? preview?.error : undefined,
  };
}
