import assert from "node:assert/strict";
import { test } from "node:test";
import { BoxGeometry, Object3D, Vector3 } from "three";
import { defaultObjectTransform } from "@theoryfoundry/contracts";
import {
  applyObjectTransform,
  readObjectTransform,
  transformedObjectDimensions,
} from "../../../../../src/features/object-editing/browser/utils/objectGeometry.util";

function near(actual: number, expected: number): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-8,
    `${actual} differs from ${expected}`,
  );
}

void test("preview uses OpenSCAD scale, X/Y/Z rotation, then world translation", () => {
  const transform = {
    position: [8, 9, 10],
    rotation: [20, 30, 40],
    scale: [2, 3, 4],
  } as const;
  const mesh = new Object3D();
  applyObjectTransform(mesh, {
    position: [...transform.position],
    rotation: [...transform.rotation],
    scale: [...transform.scale],
  });
  const expected = new Vector3(1, 2, 3).multiply(
    new Vector3(...transform.scale),
  );
  expected.applyAxisAngle(new Vector3(1, 0, 0), (20 * Math.PI) / 180);
  expected.applyAxisAngle(new Vector3(0, 1, 0), (30 * Math.PI) / 180);
  expected.applyAxisAngle(new Vector3(0, 0, 1), (40 * Math.PI) / 180);
  expected.add(new Vector3(...transform.position));
  const actual = new Vector3(1, 2, 3).applyMatrix4(mesh.matrixWorld);
  actual
    .toArray()
    .forEach((value, index) => near(value, expected.toArray()[index]!));
  const roundtrip = readObjectTransform(mesh);
  roundtrip.rotation.forEach((value, index) =>
    near(value, transform.rotation[index]!),
  );
  assert.deepEqual(roundtrip.position, transform.position);
  assert.deepEqual(roundtrip.scale, transform.scale);
});

void test("displayed dimensions include independent scaling and rotation but exclude translation", () => {
  const geometry = new BoxGeometry(10, 20, 30);
  const transform = {
    ...defaultObjectTransform(),
    position: [100, -25, 4] as [number, number, number],
    rotation: [0, 0, 90] as [number, number, number],
    scale: [2, 3, 4] as [number, number, number],
  };
  const size = transformedObjectDimensions(geometry, transform);
  size.forEach((value, index) => near(value, [60, 20, 120][index]!));
  geometry.dispose();
});
