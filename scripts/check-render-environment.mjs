import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const required = [
  "RJLS_RENDER_ENGINE", "RJLS_RENDER_MODE", "RJLS_OPENSCAD_IMAGE", "RJLS_OPENSCAD_VERSION",
  "RJLS_OPENSCAD_BINARY_SHA256", "RJLS_OPENSCAD_HELP_SHA256", "RJLS_BOSL2_PATH",
  "RJLS_BOSL2_VERSION", "RJLS_BOSL2_SHA256",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Strict renderer gate unavailable: missing ${missing.join(", ")}`);
  process.exit(2);
}
if (process.env.RJLS_RENDER_PROFILE && process.env.RJLS_RENDER_PROFILE !== "production-oci") {
  console.error("Strict renderer gate accepts only RJLS_RENDER_PROFILE=production-oci; trusted-local development provenance is never production-approved.");
  process.exit(2);
}
if (!/^(docker|podman)$/.test(process.env.RJLS_RENDER_ENGINE) || !/^(rootless|vm-backed)$/.test(process.env.RJLS_RENDER_MODE)) {
  console.error("Strict renderer gate requires docker|podman and rootless|vm-backed.");
  process.exit(2);
}
if (!/@sha256:[a-f0-9]{64}$/.test(process.env.RJLS_OPENSCAD_IMAGE) || !/^sha256:[a-f0-9]{64}$/.test(process.env.RJLS_BOSL2_SHA256)) {
  console.error("Strict renderer gate requires exact OpenSCAD and BOSL2 SHA-256 pins.");
  process.exit(2);
}
if (!existsSync(process.env.RJLS_BOSL2_PATH) || spawnSync(process.env.RJLS_RENDER_ENGINE, ["version"], { stdio: "ignore", timeout: 5_000 }).status !== 0) {
  console.error("Strict renderer gate requires the configured BOSL2 checkout and container runtime executable to be available.");
  process.exit(2);
}
const result = spawnSync("pnpm", ["--filter", "@rjls/renderer", "test"], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
