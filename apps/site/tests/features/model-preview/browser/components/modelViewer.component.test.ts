import {
  commitGeometryResource,
  disposeGeometry,
  disposeMaterialResources,
  shouldAutoFit,
} from "@/features/model-preview/browser/components/modelViewer.component";
import {
  releaseObjectUrl,
  trackObjectUrl,
} from "@/features/workspace/browser/utils/workspacePresentation.util";
import assert from "node:assert/strict";
import test from "node:test";
import { BufferGeometry, MeshStandardMaterial, Texture } from "three";

void test("camera auto-fit occurs only for the first model in each project", () => {
  assert.equal(shouldAutoFit(undefined, "project-a"), true);
  assert.equal(shouldAutoFit("project-a", "project-a"), false);
  assert.equal(shouldAutoFit("project-a", "project-b"), true);
});

void test("geometry disposal is exact-once", () => {
  const geometry = new BufferGeometry();
  let calls = 0;
  geometry.dispose = (): void => {
    calls += 1;
  };
  disposeGeometry(geometry);
  disposeGeometry(geometry);
  assert.equal(calls, 1);
});

void test("committed viewer swap keeps the previous geometry alive until commit", () => {
  const previous = new BufferGeometry();
  const next = new BufferGeometry();
  let previousDisposals = 0;
  previous.dispose = (): void => {
    previousDisposals += 1;
  };
  assert.equal(previousDisposals, 0);
  assert.equal(commitGeometryResource(previous, next), next);
  assert.equal(previousDisposals, 1);
  commitGeometryResource(previous, next);
  assert.equal(previousDisposals, 1);
});

void test("materials, textures, and object URLs dispose exactly once", () => {
  const material = new MeshStandardMaterial();
  const texture = new Texture();
  material.map = texture;
  let materialDisposals = 0;
  let textureDisposals = 0;
  material.dispose = (): void => {
    materialDisposals += 1;
  };
  texture.dispose = (): void => {
    textureDisposals += 1;
  };
  disposeMaterialResources(material);
  disposeMaterialResources(material);
  assert.deepEqual([materialDisposals, textureDisposals], [1, 1]);

  const originalRevoke = URL.revokeObjectURL;
  let revocations = 0;
  URL.revokeObjectURL = (): void => {
    revocations += 1;
  };
  try {
    trackObjectUrl("blob:theoryfoundry-test");
    releaseObjectUrl("blob:theoryfoundry-test");
    releaseObjectUrl("blob:theoryfoundry-test");
    assert.equal(revocations, 1);
  } finally {
    URL.revokeObjectURL = originalRevoke;
  }
});
