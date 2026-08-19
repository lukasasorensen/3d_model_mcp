"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { BufferGeometry, Color, Material, MeshStandardMaterial, PerspectiveCamera, Sphere, Texture, Vector3 } from "three";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cachedPreview, fetchRevisionSource, renderPreview } from "@/lib/browser-renderer";

const PREVIEW_BYTE_LIMIT = 10 * 1024 * 1024;
const PREVIEW_TRIANGLE_LIMIT = 250_000;
const disposedGeometries = new WeakSet<BufferGeometry>();
const disposedMaterials = new WeakSet<Material>();
const disposedTextures = new WeakSet<Texture>();

export function disposeGeometry(geometry: BufferGeometry | undefined): void {
  if (!geometry || disposedGeometries.has(geometry)) return;
  disposedGeometries.add(geometry);
  geometry.dispose();
}

export function commitGeometryResource(previous: BufferGeometry | undefined, next: BufferGeometry): BufferGeometry {
  if (previous !== next) disposeGeometry(previous);
  return next;
}

export function disposeMaterialResources(material: Material | undefined): void {
  if (!material || disposedMaterials.has(material)) return;
  disposedMaterials.add(material);
  for (const value of Object.values(material)) {
    if (value instanceof Texture && !disposedTextures.has(value)) {
      disposedTextures.add(value);
      value.dispose();
    }
  }
  material.dispose();
}

export function shouldAutoFit(lastFittedProjectId: string | undefined, projectId: string): boolean {
  return lastFittedProjectId !== projectId;
}

type ViewCommand = { id: number; type: "fit" | "reset" | "zoom-in" | "zoom-out" | "orbit-left" | "orbit-right" | "orbit-up" | "orbit-down" };

function Scene({ geometry, command, autoFit, onCommitted }: { geometry: BufferGeometry; command: ViewCommand; autoFit: boolean; onCommitted: (geometry: BufferGeometry) => void }) {
  const { camera, gl, invalidate } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl.domElement]);
  const material = useMemo(() => new MeshStandardMaterial({ color: new Color("#dde5dd"), roughness: 0.72, metalness: 0.05 }), []);
  const fit = useCallback(() => {
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere ?? new Sphere(new Vector3(), 1);
    const radius = Math.max(sphere.radius, 1);
    camera.position.copy(sphere.center).add(new Vector3(radius * 1.65, -radius * 1.65, radius * 1.25));
    if (camera instanceof PerspectiveCamera) { camera.near = Math.max(radius / 100, 0.01); camera.far = radius * 100; camera.updateProjectionMatrix(); }
    controls.target.copy(sphere.center);
    controls.update();
    invalidate();
  }, [camera, controls, geometry, invalidate]);

  useEffect(() => {
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    const update = () => invalidate();
    controls.addEventListener("change", update);
    return () => { controls.removeEventListener("change", update); controls.dispose(); disposeMaterialResources(material); };
  }, [controls, invalidate, material]);

  useLayoutEffect(() => {
    if (autoFit) fit();
    onCommitted(geometry);
  }, [autoFit, fit, geometry, onCommitted]);

  useEffect(() => {
    if (!command.id) return;
    if (command.type === "fit" || command.type === "reset") fit();
    else if (command.type === "zoom-in") camera.position.lerp(controls.target, 0.15);
    else if (command.type === "zoom-out") camera.position.sub(controls.target).multiplyScalar(1.18).add(controls.target);
    else {
      const offset = camera.position.clone().sub(controls.target);
      const axis = command.type === "orbit-up" || command.type === "orbit-down" ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
      const direction = command.type === "orbit-left" || command.type === "orbit-up" ? 1 : -1;
      offset.applyAxisAngle(axis, direction * 0.12);
      camera.position.copy(controls.target).add(offset);
    }
    camera.lookAt(controls.target);
    controls.update();
    invalidate();
  }, [camera, command, controls, fit, invalidate]);

  return (
    <>
      <ambientLight intensity={1.25} />
      <directionalLight position={[5, -4, 8]} intensity={2.1} />
      <gridHelper args={[400, 40, "#52665a", "#34423a"]} rotation={[Math.PI / 2, 0, 0]} />
      <axesHelper args={[24]} />
      <mesh geometry={geometry} material={material} dispose={null} />
    </>
  );
}

export type PreviewLoadState = "empty" | "loading" | "ready" | "error";

async function loadBrowserStl(projectId: string, revisionId: string, sourceHash: string, signal: AbortSignal): Promise<BufferGeometry> {
  let bytes = cachedPreview(sourceHash);
  if (!bytes) {
    const source = await fetchRevisionSource(projectId, revisionId, sourceHash, signal);
    bytes = (await renderPreview(source, sourceHash, signal)).bytes;
  }
  if (bytes.byteLength > PREVIEW_BYTE_LIMIT) throw new Error("Preview exceeds its byte limit.");
  const array = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const geometry = new STLLoader().parse(array);
  const triangles = geometry.getAttribute("position").count / 3;
  if (!Number.isInteger(triangles) || triangles > PREVIEW_TRIANGLE_LIMIT) {
    disposeGeometry(geometry);
    throw new Error("Preview triangle count failed validation.");
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function ModelViewer({ projectId, revisionId, sourceHash, currentLabel, updating, onLoadStateChange }: { projectId: string; revisionId?: string; sourceHash?: string; currentLabel: string; updating: boolean; onLoadStateChange?: (state: PreviewLoadState) => void }) {
  const [geometry, setGeometry] = useState<BufferGeometry>();
  const [loadState, setLoadState] = useState<PreviewLoadState>("empty");
  const [command, setCommand] = useState<ViewCommand>({ id: 0, type: "fit" });
  const geometryRef = useRef<BufferGeometry | undefined>(undefined);
  const pendingGeometryRef = useRef<BufferGeometry | undefined>(undefined);
  const loadGeneration = useRef(0);
  const lastFittedProjectId = useRef<string | undefined>(undefined);
  const autoFitPending = useRef(false);

  useEffect(() => {
    if (!revisionId || !sourceHash) { if (!geometryRef.current) setLoadState("empty"); return; }
    const generation = ++loadGeneration.current;
    const controller = new AbortController();
    setLoadState("loading");
    void loadBrowserStl(projectId, revisionId, sourceHash, controller.signal).then((next) => {
      if (generation !== loadGeneration.current || controller.signal.aborted) { disposeGeometry(next); return; }
      if (pendingGeometryRef.current && pendingGeometryRef.current !== geometryRef.current) disposeGeometry(pendingGeometryRef.current);
      pendingGeometryRef.current = next;
      autoFitPending.current = shouldAutoFit(lastFittedProjectId.current, projectId);
      setGeometry(next);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadState("error");
      void error;
    });
    return () => controller.abort();
  }, [projectId, revisionId, sourceHash]);

  useEffect(() => () => {
    loadGeneration.current += 1;
    disposeGeometry(geometryRef.current);
    if (pendingGeometryRef.current !== geometryRef.current) disposeGeometry(pendingGeometryRef.current);
    geometryRef.current = undefined;
    pendingGeometryRef.current = undefined;
  }, []);

  useEffect(() => { onLoadStateChange?.(loadState); }, [loadState, onLoadStateChange]);

  const commitGeometry = useCallback((next: BufferGeometry) => {
    if (pendingGeometryRef.current !== next && geometryRef.current !== next) return;
    const previous = geometryRef.current;
    geometryRef.current = commitGeometryResource(previous, next);
    pendingGeometryRef.current = undefined;
    if (autoFitPending.current) lastFittedProjectId.current = projectId;
    autoFitPending.current = false;
    setLoadState("ready");
  }, [projectId]);

  const issue = (type: ViewCommand["type"]) => setCommand({ id: command.id + 1, type });
  const keyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, ViewCommand["type"]> = { ArrowLeft: "orbit-left", ArrowRight: "orbit-right", ArrowUp: "orbit-up", ArrowDown: "orbit-down", "+": "zoom-in", "=": "zoom-in", "-": "zoom-out", "0": "reset" };
    if (event.key === "Escape") { event.currentTarget.blur(); return; }
    const next = map[event.key];
    if (next) { event.preventDefault(); issue(next); }
  };

  return (
    <div className="viewer-shell" data-testid="model-viewer">
      <div className="viewer-toolbar" aria-label="3D viewer controls">
        <button type="button" onClick={() => issue("fit")} disabled={!geometry}>Fit model</button>
        <button type="button" onClick={() => issue("reset")} disabled={!geometry}>Reset view</button>
        <button type="button" onClick={() => issue("zoom-in")} disabled={!geometry} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => issue("zoom-out")} disabled={!geometry} aria-label="Zoom out">−</button>
      </div>
      <div className="viewer-canvas" tabIndex={0} onKeyDown={keyDown} aria-label={`3D model inspection for ${currentLabel}`} aria-describedby="viewer-help">
        {geometry ? (
          <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [80, -80, 65], fov: 42 }} gl={{ antialias: true }} fallback={<div className="viewer-fallback">WebGL is unavailable. Model facts and export remain available.</div>}>
            <Scene geometry={geometry} command={command} autoFit={autoFitPending.current} onCommitted={commitGeometry} />
          </Canvas>
        ) : <div className="empty-model" aria-hidden="true"><span /><strong>No model yet</strong></div>}
      </div>
      <p id="viewer-help" className="viewer-help">Drag to orbit · two-finger drag to pan · scroll to zoom · arrows orbit · Esc releases focus</p>
      {(updating || loadState === "loading") && <div className="viewer-progress" role="status">{geometry ? `Building from ${currentLabel}. Current preview stays visible.` : "Loading validated preview…"}</div>}
      {loadState === "error" && <div className="viewer-error" role="alert">Preview could not be verified. The last valid model remains visible.</div>}
    </div>
  );
}
