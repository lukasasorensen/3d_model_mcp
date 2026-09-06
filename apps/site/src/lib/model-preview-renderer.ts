import { AmbientLight, Box3, Color, DirectionalLight, Mesh, MeshStandardMaterial, OrthographicCamera, Scene, Vector3, WebGLRenderer } from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { PREVIEW_LIMITS, type PreviewJob } from "@rjls/contracts";
import { browserRendererProvenance, renderPreview } from "./browser-renderer";

const directions = { isometric: [1,-1,1], front: [0,-1,0], back: [0,1,0], left: [-1,0,0], right: [1,0,0], top: [0,0,1], bottom: [0,0,-1] } as const;

export async function renderModelPng(job: PreviewJob, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(job.source));
  if (Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, "0")).join("") !== job.sourceHash) throw new Error("Preview source hash mismatch.");
  signal.throwIfAborted();
  const { bytes } = await renderPreview(job.source, job.sourceHash, signal);
  const geometry = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  let renderer: WebGLRenderer | undefined;
  const material = new MeshStandardMaterial({ color: "#dde5dd", roughness: 0.72, metalness: 0.05 });
  try {
    const positions = geometry.getAttribute("position");
    if (!positions || !positions.count || positions.count % 3 || positions.count / 3 > 250_000) throw new Error("Invalid preview mesh.");
    geometry.computeVertexNormals(); geometry.computeBoundingBox();
    const box = geometry.boundingBox as Box3; const center = box.getCenter(new Vector3());
    const radius = box.getSize(new Vector3()).length() / 2;
    if (![...center.toArray(), radius].every(Number.isFinite) || radius <= 0) throw new Error("Empty preview geometry.");
    const frame = radius * 1.15;
    const camera = new OrthographicCamera(-frame, frame, frame, -frame, radius * 0.01, radius * 10);
    camera.up.set(0, 0, 1);
    if (job.view === "top" || job.view === "bottom") camera.up.set(0, 1, 0);
    camera.position.copy(center).add(new Vector3(...directions[job.view]).normalize().multiplyScalar(radius * 3)); camera.lookAt(center); camera.updateProjectionMatrix();
    const scene = new Scene(); scene.background = new Color("#26352e"); scene.add(new Mesh(geometry, material));
    scene.add(new AmbientLight(0xffffff, 1.25));
    const light = new DirectionalLight(0xffffff, 2.1); light.position.copy(center).add(new Vector3(5,-4,8).normalize().multiplyScalar(radius * 3)); light.target.position.copy(center); scene.add(light, light.target);
    renderer = new WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
    renderer.setPixelRatio(1); renderer.setSize(PREVIEW_LIMITS.dimension, PREVIEW_LIMITS.dimension, false);
    signal.throwIfAborted(); renderer.render(scene, camera);
    const blob = await new Promise<Blob>((resolve, reject) => renderer!.domElement.toBlob((value) => value ? resolve(value) : reject(new Error("PNG capture failed.")), "image/png"));
    signal.throwIfAborted();
    if (blob.size > PREVIEW_LIMITS.pngBytes) throw new Error("PNG exceeds limit.");
    const png = new Uint8Array(await blob.arrayBuffer());
    let binary = ""; for (let offset = 0; offset < png.length; offset += 8192) binary += String.fromCharCode(...png.subarray(offset, offset + 8192));
    return btoa(binary);
  } finally { geometry.dispose(); material.dispose(); renderer?.dispose(); renderer?.forceContextLoss(); }
}

export async function completeModelPreview(job: PreviewJob, sessionId: string, signal: AbortSignal, onRendered: () => void = () => undefined): Promise<void> {
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  const timer = setTimeout(() => controller.abort(), Math.max(0, Date.parse(job.deadline) - Date.now()));
  try {
    let result: { png: string } | { error: "RENDER_FAILED" };
    try { result = { png: await renderModelPng(job, combined) }; }
    catch (error) { if (combined.aborted) throw error; result = { error: "RENDER_FAILED" }; }
    onRendered();
    combined.throwIfAborted();
    const { source: _source, deadline: _deadline, ...binding } = job; void _source; void _deadline;
    const response = await fetch(`/v1/projects/${encodeURIComponent(job.projectId)}/preview-jobs/complete`, {
      method: "POST", signal: combined, headers: { "content-type": "application/json", "x-rjls-session-id": sessionId },
      body: JSON.stringify({ ...binding, sessionId, provenance: browserRendererProvenance, ...result }),
    });
    if (!response.ok) throw new Error("Preview completion was not accepted.");
  } finally { clearTimeout(timer); }
}
