"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, type JSX } from "react";
import { useThree } from "@react-three/fiber";
import {
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Sphere,
  Vector3,
  type BufferGeometry,
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
  const { camera, gl, invalidate } = useThree();
  const mesh = useMemo(
    () =>
      new Mesh(
        geometry,
        new MeshStandardMaterial({ color: "#efbd62", roughness: 0.7 }),
      ),
    [geometry],
  );
  const state = useRef({ transform, onChange, onError });
  state.current = { transform, onChange, onError };
  const controls = useMemo(
    () => ({
      orbit: new OrbitControls(camera, gl.domElement),
      transform: new TransformControls(camera, gl.domElement),
    }),
    [camera, gl.domElement, mesh],
  );

  useEffect(() => {
    const orbit = controls.orbit;
    const gizmo = controls.transform;
    gizmo.attach(mesh);
    gl.domElement.tabIndex = 0;
    gizmo.setSize(0.9);
    orbit.enableDamping = false;
    orbit.rotateSpeed = 0.5;
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
    return (): void => {
      gl.domElement.removeEventListener("keydown", cancel);
      orbit.removeEventListener("change", update);
      gizmo.removeEventListener("change", update);
      gizmo.removeEventListener("objectChange", change);
      gizmo.removeEventListener("dragging-changed", dragging);
      gizmo.detach();
      gizmo.dispose();
      orbit.dispose();
      mesh.material.dispose();
    };
  }, [controls, gl.domElement, invalidate, mesh]);

  useLayoutEffect(() => {
    applyObjectTransform(mesh, transform);
    invalidate();
  }, [mesh, transform, invalidate]);

  useEffect(() => {
    controls.transform.setMode(mode);
    controls.transform.setSpace(mode === "translate" ? "world" : "local");
    controls.transform.enabled = !disabled;
    controls.transform.getHelper().visible = !disabled;
    invalidate();
  }, [controls, mode, disabled, invalidate]);

  useEffect(() => {
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    let radius = Math.max(
      (sphere?.radius ?? 1) * Math.max(...state.current.transform.scale),
      1,
    );
    const center = (sphere?.center.clone() ?? new Vector3()).applyMatrix4(
      mesh.matrixWorld,
    );
    const frame = new Sphere(center, radius).expandByPoint(mesh.position);
    radius = frame.radius;
    camera.up.set(0, 0, 1);
    camera.position
      .copy(center)
      .add(new Vector3(radius * 2.2, -radius * 2.2, radius * 1.7));
    if (camera instanceof PerspectiveCamera) {
      camera.near = Math.max(radius / 100, 0.01);
      camera.far = radius * 100;
      camera.updateProjectionMatrix();
    }
    controls.orbit.target.copy(center);
    controls.orbit.update();
    invalidate();
  }, [camera, controls, geometry, mesh, invalidate, fitVersion]);

  return (
    <>
      <ambientLight intensity={1.3} />
      <directionalLight position={[40, -30, 60]} intensity={2} />
      <gridHelper
        args={[200, 20, "#52665a", "#34423a"]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <axesHelper args={[12]} />
      <primitive object={mesh} dispose={null} />
      <primitive object={controls.transform.getHelper()} dispose={null} />
    </>
  );
}
