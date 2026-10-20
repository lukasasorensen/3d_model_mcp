import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inspectPng } from "./utils/png.util.mjs";
import { parseBinaryStl, parseThreeMf } from "@theoryfoundry/renderer";
import { startChromiumRenderer } from "../node/renderer/chromium.renderer.mjs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const solid = "difference() { cube([30,20,10], center=true); translate([6,0,0]) cylinder(h=12,r=3,center=true,$fn=32); }";


export async function runProof(directory, output) {
  await mkdir(output, { recursive: true });
  const started = performance.now();
  const renderer = await startChromiumRenderer(directory);
  const startupMs = performance.now() - started;
  const artifacts = []; const checks = [];
  async function render(source, format, name, extra = {}) {
    const before = performance.now();
    const result = await renderer.render({ source, sourceHash: sha256(source), format, ...extra });
    assert.equal(result.ok, true, JSON.stringify(result));
    const bytes = Buffer.from(result.encoded, "base64");
    const mesh = format === "stl" ? parseBinaryStl(bytes) : format === "3mf" ? parseThreeMf(bytes) : undefined;
    if (format === "png") inspectPng(bytes);
    if (format === "stl") {
      assert.equal(result.geometry.triangleCount, mesh.triangleCount);
      assert.deepEqual(result.geometry.bounds, mesh.boundingBox);
    }
    await writeFile(join(output, name), bytes);
    const artifact = { filename: name, format, byteSize: bytes.length, sha256: sha256(bytes), durationMs: Math.round(performance.now() - before), ...(mesh ? { geometry: mesh } : {}) };
    artifacts.push(artifact); return artifact;
  }
  try {
    const mesh = await render(solid, "stl", "solid.stl");
    assert.deepEqual(mesh.geometry.boundingBox, { min: [-15,-10,-5], max: [15,10,5] });
    const exported = await render(solid, "3mf", "solid.3mf");
    assert.deepEqual(exported.geometry.boundingBox, mesh.geometry.boundingBox);
    assert.equal(exported.geometry.triangleCount, mesh.geometry.triangleCount);
    checks.push("STL and 3MF parsed geometry matches the existing browser mesh summary and expected solid dimensions");
    for (const view of ["isometric", "front", "back", "left", "right", "top", "bottom"]) await render(solid, "png", `solid-${view}.png`, { view });
    const pngs = artifacts.filter(artifact => artifact.format === "png");
    assert.ok(new Set(pngs.map(artifact => artifact.sha256)).size >= 4, "Camera views must produce distinct images");
    checks.push("Seven bounded 768x768 PNG views contain decoded image data");
    await render('include <BOSL2/std.scad>\ncuboid([12,18,6], rounding=1, $fn=16);', "stl", "bosl2.stl");
    await render('include <BOSL2/std.scad>\ncuboid([12,18,6], rounding=1, $fn=16);', "png", "bosl2.png");
    checks.push("Pinned BOSL2 compiles and renders");
    const complex = "difference() { union() { for (i=[0:7]) rotate([0,0,i*45]) translate([12,0,0]) cylinder(h=8,r=5,$fn=96); cylinder(h=8,r=13,$fn=96); } translate([0,0,-1]) cylinder(h=10,r=6,$fn=96); }";
    const complexMesh = await render(complex, "stl", "complex.stl");
    assert.ok(complexMesh.geometry.triangleCount > 1000);
    await render(complex, "png", "complex.png");
    checks.push("A bounded multi-solid boolean model renders above 1000 triangles");
    const invalid = await renderer.render({ source: "cube([;", sourceHash: sha256("cube([;"), format: "stl" });
    assert.equal(invalid.ok, false); assert.equal(invalid.failureKind, "model");
    checks.push("Invalid OpenSCAD is classified as model rejection");
    const cancelledSource = "sphere(r=8,$fn=180);";
    const cancelled = await renderer.render({ source: cancelledSource, sourceHash: sha256(cancelledSource), format: "stl", cancelImmediately: true });
    assert.equal(cancelled.ok, false); assert.equal(cancelled.name, "AbortError");
    await render("cube([3,4,5]);", "stl", "after-cancellation.stl");
    checks.push("An in-flight worker is cancelled and a subsequent render succeeds");
    const mismatch = await renderer.render({ source: solid, sourceHash: "0".repeat(64), format: "stl" });
    assert.equal(mismatch.ok, false); assert.match(mismatch.message, /hash mismatch/);
    assert.equal(renderer.blockedRequests.length, 0);
    checks.push("Source hash mismatch rejected; renderer uses only loopback packaged assets");
    return { platform: process.platform, architecture: process.arch, node: process.version, ...renderer.info, startupMs: Math.round(startupMs), totalMs: Math.round(performance.now() - started), checks, artifacts, assetRequests: [...new Set(renderer.requests)] };
  } finally { await renderer.close(); }
}
