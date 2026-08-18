import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { unzipSync } from "fflate";

const OPENSCAD_URL = "https://files.openscad.org/snapshots/OpenSCAD-2026.07.20-WebAssembly-web.zip";
const OPENSCAD_SHA256 = "8b81d3d025f29bc1dec40a2ce5acbad5bd06a0f568c1bfa1f6572ad5baa97dcd";
const BOSL2_URL = "https://github.com/BelfrySCAD/BOSL2/archive/refs/tags/v2.0.741.zip";
const BOSL2_SHA256 = "4fb7b58cbeadfe5f8c5a037d9e1392d774117d48423f95f4203aa367d8b1ea88";
const target = resolve("apps/site/public/vendor/openscad");

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function exists(path) { try { await stat(path); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; } }
async function preparedIsValid() {
  if (!(await exists(join(target, ".complete")))) return false;
  try {
    return sha256(await readFile(join(target, "openscad.js"))) === "e458673d46d506d77b780c526d6e5492250f353d582057c6f912724a9586d86e"
      && sha256(await readFile(join(target, "openscad.wasm"))) === "c19a3a868991e86f76f22f254e04002db45f00c91f24e4c672cf93c859e80e19"
      && sha256(await readFile(join(target, "bosl2.zip"))) === BOSL2_SHA256;
  } catch { return false; }
}
async function download(url, expected) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download pinned renderer asset: ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (sha256(bytes) !== expected) throw new Error(`Pinned renderer asset failed SHA-256 verification: ${url}`);
  return bytes;
}

if (!(await preparedIsValid())) {
  const [openscadArchive, bosl2Archive] = await Promise.all([
    download(OPENSCAD_URL, OPENSCAD_SHA256),
    download(BOSL2_URL, BOSL2_SHA256),
  ]);
  const openscad = unzipSync(openscadArchive);
  const bosl2 = unzipSync(bosl2Archive);
  await mkdir(join(target, "BOSL2"), { recursive: true });
  for (const name of ["openscad.js", "openscad.wasm"]) {
    const bytes = openscad[name];
    if (!bytes) throw new Error(`Pinned OpenSCAD archive is missing ${name}.`);
    await writeFile(join(target, name), bytes);
  }
  await writeFile(join(target, "bosl2.zip"), bosl2Archive);
  for (const [archiveName, bytes] of Object.entries(bosl2)) {
    const relative = archiveName.replace(/^BOSL2-2\.0\.741\//, "");
    if (!relative || archiveName === relative || (!relative.endsWith(".scad") && relative !== "LICENSE")) continue;
    const output = join(target, "BOSL2", relative);
    await mkdir(resolve(output, ".."), { recursive: true });
    await writeFile(output, bytes);
  }
  await writeFile(join(target, "manifest.json"), `${JSON.stringify({
    openscadVersion: "2026.07.20",
    openscadArchiveSha256: OPENSCAD_SHA256,
    openscadGlueSha256: sha256(await readFile(join(target, "openscad.js"))),
    openscadWasmSha256: sha256(await readFile(join(target, "openscad.wasm"))),
    bosl2Version: "v2.0.741",
    bosl2ArchiveSha256: BOSL2_SHA256,
  }, null, 2)}\n`);
  await writeFile(join(target, ".complete"), "verified\n");
}
