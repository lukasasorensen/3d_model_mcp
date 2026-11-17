"use client";
import { useLayoutEffect, useRef, type JSX } from "react";
import { useThree } from "@react-three/fiber";
import {
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Sphere,
  Vector3,
  type BufferGeometry,
  type Camera,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  TransformControls,
  type TransformControlsMode,
} from "three/addons/controls/TransformControls.js";
import {
  objectTransformSchema,
  type ObjectTransform,
} from "@theoryfoundry/contracts";
import {
  applyObjectTransform,
  readObjectTransform,
} from "../utils/objectGeometry.util";

type SceneResources = {
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  orbit: OrbitControls;
  gizmo: TransformControls;
};

function fitScene(camera: Camera, { mesh, orbit }: SceneResources): void {
  mesh.geometry.computeBoundingSphere();
  const sphere = mesh.geometry.boundingSphere;
  let radius = Math.max(
    (sphere?.radius ?? 1) * Math.max(...mesh.scale.toArray()),
    1,
  );
  const center = (sphere?.center.clone() ?? new Vector3()).applyMatrix4(
    mesh.matrixWorld,
  );
  radius = new Sphere(center, radius).expandByPoint(mesh.position).radius;
  camera.up.set(0, 0, 1);
  camera.position
    .copy(center)
    .add(new Vector3(radius * 2.2, -radius * 2.2, radius * 1.7));
  if (camera instanceof PerspectiveCamera) {
    camera.near = Math.max(radius / 100, 0.01);
    camera.far = radius * 100;
    camera.updateProjectionMatrix();
  }
  orbit.target.copy(center);
  orbit.update();
}

export function ObjectTransformScene({
  geometry,
  transform,
  mode,
  disabled,
  onChange,
  onError,
  fitVersion,
}: {
  geometry: BufferGeometry;
  transform: ObjectTransform;
  mode: TransformControlsMode;
  disabled: boolean;
  onChange(transform: ObjectTransform): void;
  onError(message: string | undefined): void;
  fitVersion: number;
}): JSX.Element {
  const { camera, gl, invalidate, scene } = useThree();
  const state = useRef({ transform, mode, disabled, onChange, onError });
  useLayoutEffect(() => {
    state.current = { transform, mode, disabled, onChange, onError };
  });
  const resources = useRef<SceneResources | undefined>(undefined);

  useLayoutEffect(() => {
    // These constructors attach DOM listeners. Every committed setup owns fresh
    // resources, including React's development setup/cleanup/setup replay.
    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({ color: "#efbd62", roughness: 0.7 }),
    );
    const orbit = new OrbitControls(camera, gl.domElement);
    const gizmo = new TransformControls(camera, gl.domElement);
    const owned = { mesh, orbit, gizmo };
    resources.current = owned;
    applyObjectTransform(mesh, state.current.transform);
    scene.add(mesh, gizmo.getHelper());
    gizmo.attach(mesh);
    gl.domElement.tabIndex = 0;
    gizmo.setSize(0.9);
    gizmo.setMode(state.current.mode);
    gizmo.setSpace(state.current.mode === "translate" ? "world" : "local");
    gizmo.enabled = !state.current.disabled;
    gizmo.getHelper().visible = !state.current.disabled;
    orbit.enableDamping = false;
    orbit.rotateSpeed = 0.5;
    fitScene(camera, owned);
    const update = (): void => invalidate();
    const dragging = (event: { value: unknown }): void => {
      orbit.enabled = !event.value;
    };
    const change = (): void => {
      const dragged = readObjectTransform(mesh);
      const field =
        gizmo.mode === "translate"
          ? "position"
          : gizmo.mode === "rotate"
            ? "rotation"
            : "scale";
      const parsed = objectTransformSchema.safeParse({
        ...state.current.transform,
        [field]: dragged[field],
      });
      if (parsed.success) {
        state.current.onError(undefined);
        state.current.onChange(parsed.data);
      } else {
        applyObjectTransform(mesh, state.current.transform);
        state.current.onError(
          "That transform is outside the supported range. Scale must stay positive; use the numeric controls for precise values.",
        );
      }
      invalidate();
    };
    const cancel = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && gizmo.dragging) gizmo.reset();
    };
    orbit.addEventListener("change", update);
    gizmo.addEventListener("change", update);
    gizmo.addEventListener("objectChange", change);
    gizmo.addEventListener("dragging-changed", dragging);
    gl.domElement.addEventListener("keydown", cancel);
    invalidate();
    return (): void => {
      resources.current = undefined;
      gl.domElement.removeEventListener("keydown", cancel);
      orbit.removeEventListener("change", update);
      gizmo.removeEventListener("change", update);
      gizmo.removeEventListener("objectChange", change);
      gizmo.removeEventListener("dragging-changed", dragging);
      scene.remove(mesh, gizmo.getHelper());
      gizmo.detach();
      gizmo.dispose();
      orbit.dispose();
      mesh.material.dispose();
    };
  }, [camera, geometry, gl.domElement, invalidate, scene]);

  useLayoutEffect(() => {
    if (resources.current)
      applyObjectTransform(resources.current.mesh, transform);
    invalidate();
  }, [transform, invalidate]);

  useLayoutEffect(() => {
    const gizmo = resources.current?.gizmo;
    if (!gizmo) return;
    gizmo.setMode(mode);
    gizmo.setSpace(mode === "translate" ? "world" : "local");
    gizmo.enabled = !disabled;
    gizmo.getHelper().visible = !disabled;
    invalidate();
  }, [mode, disabled, invalidate]);

  useLayoutEffect(() => {
    if (resources.current) fitScene(camera, resources.current);
    invalidate();
  }, [camera, invalidate, fitVersion]);

  return (
    <>
      <ambientLight intensity={1.3} />
      <directionalLight position={[40, -30, 60]} intensity={2} />
      <gridHelper
        args={[200, 20, "#52665a", "#34423a"]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <axesHelper args={[12]} />
    </>
  );
}
