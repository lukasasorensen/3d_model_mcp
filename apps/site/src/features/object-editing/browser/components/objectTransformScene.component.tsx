"use client";
import { useLayoutEffect, useMemo, useRef, type JSX } from "react";
import { useThree } from "@react-three/fiber";
import {
  Box3,
  type Mesh,
  PerspectiveCamera,
  Sphere,
  Vector3,
  type BufferGeometry,
} from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  TransformControls,
  type TransformControlsMode,
} from "three/addons/controls/TransformControls.js";
import {
  objectTransform,
  objectTransformSchema,
  type ModelFiles,
  type ObjectTransform,
} from "@theoryfoundry/contracts";
import { readCadViewportColors } from "../../../../shared/editor-theme/index";
import {
  applyObjectTransform,
  readObjectTransform,
} from "../utils/objectGeometry.util";

interface ObjectTransformSceneProps {
  meshes: ReadonlyMap<string, BufferGeometry>;
  objects: ModelFiles["objects"];
  selectedId: string | null;
  showOperands: boolean;
  mode: TransformControlsMode;
  disabled: boolean;
  orbit: OrbitControls;
  fitRequest: { id: string } | undefined;
  onSelect(id: string): void;
  onChange(transform: ObjectTransform): void;
  onError(message: string | undefined): void;
  onDragChange?(active: boolean): void;
  onDragCancel?(): void;
}

export function ObjectTransformScene({
  meshes,
  objects,
  selectedId,
  showOperands,
  mode,
  disabled,
  orbit,
  fitRequest,
  onSelect,
  onChange,
  onError,
  onDragChange,
  onDragCancel,
}: ObjectTransformSceneProps): JSX.Element {
  const { camera, gl, invalidate, scene } = useThree();
  const colors = useMemo(
    () => readCadViewportColors(gl.domElement),
    [gl.domElement],
  );
  const refs = useRef(new Map<string, Mesh>());
  const controls = useRef<TransformControls | undefined>(undefined);
  const selected = objects.find((object) => object.id === selectedId);
  const latest = useRef({
    selected,
    onChange,
    onError,
    onDragChange,
    onDragCancel,
  });
  const lastFit = useRef<typeof fitRequest>(undefined);
  useLayoutEffect(() => {
    latest.current = {
      selected,
      onChange,
      onError,
      onDragChange,
      onDragCancel,
    };
  });
  useLayoutEffect(() => {
    const gizmo = new TransformControls(camera, gl.domElement);
    controls.current = gizmo;
    const helper = gizmo.getHelper();
    scene.add(helper);
    gizmo.setSize(0.85);
    const update = (): void => invalidate();
    const dragging = (event: { value: unknown }): void => {
      orbit.enabled = !event.value;
      latest.current.onDragChange?.(Boolean(event.value));
    };
    const change = (): void => {
      const { selected, onChange, onError } = latest.current;
      if (!selected || !gizmo.object) return;
      const transform = objectTransform(selected);
      const dragged = readObjectTransform(gizmo.object);
      const field =
        gizmo.mode === "translate"
          ? "position"
          : gizmo.mode === "rotate"
            ? "rotation"
            : "scale";
      const parsed = objectTransformSchema.safeParse({
        ...transform,
        [field]: dragged[field],
      });
      if (parsed.success) {
        onError(undefined);
        onChange(parsed.data);
      } else {
        applyObjectTransform(gizmo.object, transform);
        onError(
          "That transform is outside the supported range. Use the exact fields for precise values.",
        );
      }
      invalidate();
    };
    const cancel = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && gizmo.dragging) {
        gizmo.reset();
        latest.current.onDragCancel?.();
        event.stopPropagation();
      }
    };
    gizmo.addEventListener("change", update);
    gizmo.addEventListener("objectChange", change);
    gizmo.addEventListener("dragging-changed", dragging);
    const focusTarget = gl.domElement.closest<HTMLElement>(".viewer-canvas");
    focusTarget?.addEventListener("keydown", cancel, true);
    return (): void => {
      controls.current = undefined;
      focusTarget?.removeEventListener("keydown", cancel, true);
      orbit.enabled = true;
      gizmo.detach();
      gizmo.dispose();
      scene.remove(helper);
    };
  }, [camera, gl.domElement, invalidate, orbit, scene]);
  useLayoutEffect(() => {
    for (const object of objects) {
      const mesh = refs.current.get(object.id);
      if (mesh) applyObjectTransform(mesh, objectTransform(object));
    }
    const gizmo = controls.current;
    const mesh = selectedId ? refs.current.get(selectedId) : undefined;
    if (gizmo) {
      gizmo.setMode(mode);
      gizmo.setSpace(mode === "translate" ? "world" : "local");
      gizmo.enabled = Boolean(mesh && !disabled);
      if (mesh && !disabled) {
        if (gizmo.object !== mesh) gizmo.attach(mesh);
      } else if (gizmo.object) {
        if (gizmo.dragging) {
          gizmo.dragging = false;
          orbit.enabled = true;
        }
        gizmo.detach();
      }
    }
    if (
      mesh &&
      fitRequest &&
      fitRequest !== lastFit.current &&
      selectedId === fitRequest.id
    ) {
      lastFit.current = fitRequest;
      const { center, radius } = new Box3()
        .setFromObject(mesh, true)
        .getBoundingSphere(new Sphere());
      const distance = Math.max(radius, 1);
      camera.position
        .copy(center)
        .add(new Vector3(1.65, -1.65, 1.25).multiplyScalar(distance));
      if (camera instanceof PerspectiveCamera) {
        camera.near = Math.min(camera.near, distance / 100);
        camera.updateProjectionMatrix();
      }
      orbit.target.copy(center);
      orbit.update();
    }
    invalidate();
  }, [
    camera,
    disabled,
    fitRequest,
    invalidate,
    meshes,
    mode,
    objects,
    orbit,
    selectedId,
    showOperands,
  ]);

  return (
    <>
      {objects.map((object) => {
        const geometry = meshes.get(object.fileId);
        if (!geometry) return null;
        const active = selectedId === object.id;
        return (
          <mesh
            key={object.id}
            ref={(mesh) => {
              if (mesh) refs.current.set(object.id, mesh);
              else refs.current.delete(object.id);
            }}
            geometry={geometry}
            visible={showOperands}
            onClick={(event) => {
              if (disabled || event.delta > 5 || controls.current?.dragging)
                return;
              event.stopPropagation();
              onSelect(object.id);
            }}
          >
            <meshStandardMaterial
              color={active ? colors.selectedModel : colors.model}
              roughness={0.72}
            />
          </mesh>
        );
      })}
    </>
  );
}
