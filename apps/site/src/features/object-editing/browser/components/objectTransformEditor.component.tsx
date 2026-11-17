"use client";
import { useEffect, useId, useMemo, useState, type JSX } from "react";
import { Canvas } from "@react-three/fiber";
import type { BufferGeometry } from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import type { TransformControlsMode } from "three/addons/controls/TransformControls.js";
import type { ObjectTransform } from "@theoryfoundry/contracts";
import { useBrowserRenderer } from "../../../browser-rendering/browser/index";
import { ObjectTransformScene } from "./objectTransformScene.component";
import { TransformNumericFields } from "./transformNumericFields.component";
import { transformedObjectDimensions } from "../utils/objectGeometry.util";

const PREVIEW_BYTE_LIMIT = 10 * 1024 * 1024;
const PREVIEW_TRIANGLE_LIMIT = 250_000;

export function ObjectTransformEditor({
  objectName,
  source,
  transform,
  onChange,
  disabled = false,
  onValidityChange,
}: {
  objectName: string;
  source: string;
  transform: ObjectTransform;
  onChange(transform: ObjectTransform): void;
  disabled?: boolean;
  onValidityChange?: ((valid: boolean) => void) | undefined;
}): JSX.Element {
  const renderer = useBrowserRenderer();
  const [mode, setMode] = useState<TransformControlsMode>("translate");
  const [preview, setPreview] = useState<{
    source: string;
    geometry: BufferGeometry;
  }>();
  const [loadError, setLoadError] = useState<string>();
  const [dragError, setDragError] = useState<string>();
  const [fitVersion, setFitVersion] = useState(0);
  const id = useId();
  const geometry =
    !disabled && preview?.source === source ? preview.geometry : undefined;
  const dimensions = useMemo(
    () =>
      geometry ? transformedObjectDimensions(geometry, transform) : undefined,
    [geometry, transform],
  );

  useEffect(() => {
    if (disabled) {
      setPreview(undefined);
      return;
    }
    const abort = new AbortController();
    let ownedGeometry: BufferGeometry | undefined;
    setLoadError(undefined);
    setDragError(undefined);
    const load = async (): Promise<void> => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(source),
      );
      const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const cached = renderer.cachedPreview(hash);
      const bytes =
        cached ??
        (await renderer.renderPreview(source, hash, abort.signal)).bytes;
      abort.signal.throwIfAborted();
      if (bytes.byteLength > PREVIEW_BYTE_LIMIT)
        throw new Error("The selected object preview is too large.");
      const next = new STLLoader().parse(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      );
      ownedGeometry = next;
      const positions = next.getAttribute("position");
      const triangles = positions.count / 3;
      if (
        !Number.isInteger(triangles) ||
        triangles <= 0 ||
        triangles > PREVIEW_TRIANGLE_LIMIT
      )
        throw new Error(
          "The selected object has no supported preview geometry.",
        );
      for (let index = 0; index < positions.array.length; index += 1)
        if (!Number.isFinite(positions.array[index]))
          throw new Error(
            "The selected object preview contains invalid coordinates.",
          );
      next.computeVertexNormals();
      next.computeBoundingSphere();
      setPreview({ source, geometry: next });
    };
    void load().catch((error: unknown) => {
      if (!abort.signal.aborted) {
        ownedGeometry?.dispose();
        ownedGeometry = undefined;
        setLoadError(
          error instanceof Error
            ? error.message
            : "The selected object preview is unavailable.",
        );
      }
    });
    return (): void => {
      abort.abort();
      ownedGeometry?.dispose();
    };
  }, [source, renderer, disabled]);

  return (
    <section
      className="object-transform-editor"
      aria-label={`Transform ${objectName}`}
    >
      <h3>Editing {objectName}</h3>
      <div
        className="object-transform-modes"
        role="group"
        aria-label="Object transform tool"
      >
        {(
          [
            ["translate", "Move"],
            ["rotate", "Rotate"],
            ["scale", "Scale"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={mode === value}
            disabled={disabled}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <TransformNumericFields
        transform={transform}
        mode={mode}
        disabled={disabled}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
      <p id={`${id}-help`} className="object-transform-help">
        Selected object only · pivot at its local origin (0, 0, 0). Move uses
        world axes; rotate and scale use local axes. Drag a colored handle to
        edit; drag the background to orbit. X red · Y green · Z blue. Use the
        center scale handle to resize uniformly. Numeric fields offer the same
        edits by keyboard or touch. Apply validates the full composition.
      </p>
      <div
        className="object-transform-canvas"
        aria-label={`Direct manipulation preview for ${objectName}`}
        aria-describedby={`${id}-help`}
      >
        {geometry ? (
          <Canvas
            frameloop="demand"
            dpr={[1, 1.5]}
            camera={{ position: [60, -60, 45], fov: 42 }}
            gl={{ antialias: true }}
            fallback={
              <p>WebGL is unavailable. Use the numeric transform fields.</p>
            }
          >
            <ObjectTransformScene
              geometry={geometry}
              transform={transform}
              mode={mode}
              disabled={disabled}
              onChange={onChange}
              onError={setDragError}
              fitVersion={fitVersion}
            />
          </Canvas>
        ) : (
          <p role="status">
            {loadError
              ? "Use the numeric fields to continue editing."
              : disabled
                ? "Editing is paused while the model is busy."
                : "Rendering selected object…"}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={!geometry}
        onClick={() => setFitVersion((value) => value + 1)}
      >
        Fit selected object
      </button>
      {dimensions && (
        <p className="object-transform-dimensions" aria-live="polite">
          Object bounds · X {dimensions[0].toFixed(3)} mm · Y{" "}
          {dimensions[1].toFixed(3)} mm · Z {dimensions[2].toFixed(3)} mm
        </p>
      )}
      {loadError && (
        <p className="notice-error" role="alert">
          Selected-object preview unavailable: {loadError}
        </p>
      )}
      {dragError && (
        <p className="notice-error" role="alert">
          {dragError}
        </p>
      )}
    </section>
  );
}
