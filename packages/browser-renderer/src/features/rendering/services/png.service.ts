import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { PREVIEW_LIMITS, type PreviewJob } from "@theoryfoundry/contracts";

const directions = {
  isometric: [1, -1, 1],
  front: [0, -1, 0],
  back: [0, 1, 0],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
} as const;

export async function renderPng(
  bytes: Uint8Array,
  view: PreviewJob["view"],
  signal: AbortSignal,
): Promise<string> {
  const geometry = new STLLoader().parse(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  );
  let renderer: WebGLRenderer | undefined;
  const material = new MeshStandardMaterial({
    color: "#dde5dd",
    roughness: 0.72,
    metalness: 0.05,
  });
  try {
    const positions = geometry.getAttribute("position");
    if (
      !positions ||
      !positions.count ||
      positions.count % 3 ||
      positions.count / 3 > 250_000
    )
      throw new Error("Invalid preview mesh.");
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox as Box3;
    const center = box.getCenter(new Vector3());
    const radius = box.getSize(new Vector3()).length() / 2;
    if (![...center.toArray(), radius].every(Number.isFinite) || radius <= 0)
      throw new Error("Empty preview geometry.");
    const frame = radius * 1.15;
    const camera = new OrthographicCamera(
      -frame,
      frame,
      frame,
      -frame,
      radius * 0.01,
      radius * 10,
    );
    camera.up.set(0, 0, 1);
    if (view === "top" || view === "bottom") camera.up.set(0, 1, 0);
    camera.position
      .copy(center)
      .add(
        new Vector3(...directions[view]).normalize().multiplyScalar(radius * 3),
      );
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    const scene = new Scene();
    scene.background = new Color("#26352e");
    scene.add(new Mesh(geometry, material));
    scene.add(new AmbientLight(0xffffff, 1.25));
    const light = new DirectionalLight(0xffffff, 2.1);
    light.position
      .copy(center)
      .add(new Vector3(5, -4, 8).normalize().multiplyScalar(radius * 3));
    light.target.position.copy(center);
    scene.add(light, light.target);
    renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(PREVIEW_LIMITS.dimension, PREVIEW_LIMITS.dimension, false);
    signal.throwIfAborted();
    renderer.render(scene, camera);
    const blob = await new Promise<Blob>((resolve, reject) =>
      renderer!.domElement.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("PNG capture failed.")),
        "image/png",
      ),
    );
    signal.throwIfAborted();
    if (blob.size > PREVIEW_LIMITS.pngBytes)
      throw new Error("PNG exceeds limit.");
    const png = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < png.length; offset += 8192)
      binary += String.fromCharCode(...png.subarray(offset, offset + 8192));
    return btoa(binary);
  } finally {
    geometry.dispose();
    material.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
