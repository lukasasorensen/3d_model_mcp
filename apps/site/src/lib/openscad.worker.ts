/// <reference lib="webworker" />

import { BROWSER_RENDERER } from "@rjls/contracts";
import { unzipSync } from "fflate";

type RenderMessage = { source: string; format: "stl" | "3mf" };
type OpenScadModule = {
  FS: { mkdirTree(path: string): void; writeFile(path: string, value: string | Uint8Array): void; readFile(path: string): Uint8Array };
  ENV: Record<string, string>;
  callMain(args: string[]): number;
};

declare const self: DedicatedWorkerGlobalScope;

async function verifiedBytes(path: string, expectedHash: string, label: string): Promise<Uint8Array> {
  const response = await fetch(new URL(path, self.location.origin), { cache: "force-cache" });
  if (!response.ok) throw new Error(`Pinned ${label} is unavailable.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const actual = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  if (actual !== expectedHash) throw new Error(`Pinned ${label} failed integrity verification.`);
  return bytes;
}

self.onmessage = async (event: MessageEvent<RenderMessage>) => {
  const diagnostics: string[] = [];
  let moduleUrl: string | undefined;
  try {
    const [glueBytes, wasmBytes, boslBytes] = await Promise.all([
      verifiedBytes("/vendor/openscad/openscad.js", BROWSER_RENDERER.openscadGlueSha256, "OpenSCAD JavaScript"),
      verifiedBytes("/vendor/openscad/openscad.wasm", BROWSER_RENDERER.openscadWasmSha256, "OpenSCAD WebAssembly"),
      verifiedBytes("/vendor/openscad/bosl2.zip", BROWSER_RENDERER.bosl2ArchiveSha256, "BOSL2 bundle"),
    ]);
    moduleUrl = URL.createObjectURL(new Blob([glueBytes.slice().buffer as ArrayBuffer], { type: "text/javascript" }));
    const imported = await import(/* webpackIgnore: true */ moduleUrl) as { default: (options: Record<string, unknown>) => Promise<OpenScadModule> };
    const instance = await imported.default({
      noInitialRun: true,
      wasmBinary: wasmBytes,
      print: (line: unknown) => diagnostics.push(String(line)),
      printErr: (line: unknown) => diagnostics.push(String(line)),
    });
    instance.FS.mkdirTree("/libraries/BOSL2");
    const boslFiles = unzipSync(boslBytes);
    for (const [name, bytes] of Object.entries(boslFiles)) {
      const relative = name.replace(/^BOSL2-2\.0\.741\//, "");
      if (!relative || name === relative || (!relative.endsWith(".scad") && relative !== "LICENSE")) continue;
      const destination = `/libraries/BOSL2/${relative}`;
      instance.FS.mkdirTree(destination.slice(0, destination.lastIndexOf("/")));
      instance.FS.writeFile(destination, bytes);
    }
    instance.ENV.OPENSCADPATH = "/libraries";
    instance.FS.writeFile("/model.scad", event.data.source);
    const output = event.data.format === "stl" ? "/preview.stl" : "/export.3mf";
    const args = ["--enable=manifold", "-o", output];
    if (event.data.format === "stl") args.push("--export-format", "binstl");
    args.push("/model.scad");
    const exitCode = instance.callMain(args);
    if (exitCode !== 0) throw new Error(`OpenSCAD exited with status ${exitCode}.`);
    const bytes = instance.FS.readFile(output).slice();
    self.postMessage({ ok: true, bytes, diagnostics }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ ok: false, diagnostics, message: error instanceof Error ? error.message : "OpenSCAD rendering failed." });
  } finally {
    if (moduleUrl) URL.revokeObjectURL(moduleUrl);
  }
};

export {};
