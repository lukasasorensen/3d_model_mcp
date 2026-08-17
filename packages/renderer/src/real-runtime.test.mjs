import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { IsolatedOpenScadRenderer, OciCliRuntime } from "../dist/index.js";

const requiredNames = ["RJLS_RENDER_ENGINE", "RJLS_RENDER_MODE", "RJLS_OPENSCAD_IMAGE", "RJLS_OPENSCAD_VERSION", "RJLS_OPENSCAD_BINARY_SHA256", "RJLS_OPENSCAD_HELP_SHA256", "RJLS_BOSL2_PATH", "RJLS_BOSL2_VERSION", "RJLS_BOSL2_SHA256"];
const missing = requiredNames.filter((name) => !process.env[name]);
const engine = process.env.RJLS_RENDER_ENGINE;
const engineAvailable = Boolean(engine && spawnSync(engine, ["version"], { stdio: "ignore", timeout: 5_000 }).status === 0);
const bosl2Available = Boolean(process.env.RJLS_BOSL2_PATH && existsSync(process.env.RJLS_BOSL2_PATH));
const unavailable = [...missing, ...(!engineAvailable ? ["container runtime executable"] : []), ...(!bosl2Available ? ["BOSL2 path"] : [])];

test("real pinned OpenSCAD+BOSL2 OCI smoke", { skip: unavailable.length === 0 ? false : `missing real-runtime prerequisites: ${unavailable.join(", ")}` }, async () => {
  const required = (name) => {
    const value = process.env[name];
    assert.ok(value, `${name} is required`);
    return value;
  };
  const image = required("RJLS_OPENSCAD_IMAGE");
  const imageDigest = image.slice(image.lastIndexOf("@") + 1);
  const runtime = new OciCliRuntime(required("RJLS_RENDER_ENGINE"), required("RJLS_RENDER_MODE"));
  const renderer = new IsolatedOpenScadRenderer({
    runtime,
    image,
    imageDigest,
    openscadVersion: required("RJLS_OPENSCAD_VERSION"),
    openscadBinaryHash: required("RJLS_OPENSCAD_BINARY_SHA256"),
    openscadHelpHash: required("RJLS_OPENSCAD_HELP_SHA256"),
    bosl2Path: required("RJLS_BOSL2_PATH"),
    bosl2Version: required("RJLS_BOSL2_VERSION"),
    bosl2Digest: required("RJLS_BOSL2_SHA256"),
  });
  const source = "include <BOSL2/std.scad>\ncuboid([10,20,5], anchor=BOTTOM);";
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const result = await renderer.validateAndRender({ projectId: "smoke", candidateId: "smoke", source, sourceHash, previewProfile: "standard" });
  assert.equal(result.outcome, "VALID");
  assert.deepEqual(result.artifacts.map((artifact) => artifact.format), ["stl", "3mf"]);
  assert.equal(result.provenance.imageDigest, imageDigest);
});
