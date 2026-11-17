import {
  Box3,
  Euler,
  Matrix4,
  type Object3D,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from "three";
import type { ObjectTransform } from "@theoryfoundry/contracts";

const RADIANS_PER_DEGREE = Math.PI / 180;

/** OpenSCAD rotates about X, then Y, then Z: Rz · Ry · Rx. */
export function applyObjectTransform(
  object: Object3D,
  transform: ObjectTransform,
): void {
  object.position.fromArray(transform.position);
  object.rotation.set(
    transform.rotation[0] * RADIANS_PER_DEGREE,
    transform.rotation[1] * RADIANS_PER_DEGREE,
    transform.rotation[2] * RADIANS_PER_DEGREE,
    "ZYX",
  );
  object.scale.fromArray(transform.scale);
  object.updateMatrixWorld(true);
}

export function readObjectTransform(object: Object3D): ObjectTransform {
  const rotation = new Euler().setFromQuaternion(object.quaternion, "ZYX");
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [
      rotation.x / RADIANS_PER_DEGREE,
      rotation.y / RADIANS_PER_DEGREE,
      rotation.z / RADIANS_PER_DEGREE,
    ],
    scale: [object.scale.x, object.scale.y, object.scale.z],
  };
}

/** Measure transformed vertices, rather than the looser transformed bounding box. */
export function transformedObjectDimensions(
  geometry: BufferGeometry,
  transform: ObjectTransform,
): [number, number, number] {
  const rotation = new Euler(
    transform.rotation[0] * RADIANS_PER_DEGREE,
    transform.rotation[1] * RADIANS_PER_DEGREE,
    transform.rotation[2] * RADIANS_PER_DEGREE,
    "ZYX",
  );
  const matrix = new Matrix4().compose(
    new Vector3().fromArray(transform.position),
    new Quaternion().setFromEuler(rotation),
    new Vector3().fromArray(transform.scale),
  );
  const bounds = new Box3();
  const point = new Vector3();
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1)
    bounds.expandByPoint(
      point.fromBufferAttribute(positions, index).applyMatrix4(matrix),
    );
  const size = bounds.getSize(point);
  return [size.x, size.y, size.z];
}
