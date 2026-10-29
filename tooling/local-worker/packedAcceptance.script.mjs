import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { startPackageRegistry } from "./packageRegistry.fixture.mjs";
import { runPacked, initializeStdio } from "./packedProcess.fixture.mjs";
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const version = JSON.parse(
  await readFile(join(root, "packages/local-worker/package.json"), "utf8"),
).version;
const smoke = process.argv.includes("--smoke");
const archiveArgument = process.argv.slice(2).find((arg) => arg !== "--smoke");
const archive = resolve(
  archiveArgument ??
    join(root, "dist/packages", `theoryfoundry-local-worker-${version}.tgz`),
);
const tarball = await readFile(archive);
const manifest = JSON.parse(
  (await exec("tar", ["-xOzf", archive, "package/package.json"])).stdout,
);
const files = (await exec("tar", ["-tzf", archive])).stdout.trim().split("\n");
assert.equal(manifest.version, version);
assert.equal(manifest.name, "@theoryfoundry/local-worker");
assert.equal(manifest.bin["theoryfoundry-worker"], "dist/cli.js");
assert.equal(manifest.scripts, undefined);
assert.doesNotMatch(JSON.stringify(manifest), /workspace:|file:|link:/);
for (const [name, value] of Object.entries(manifest.dependencies)) {
  assert.ok(!name.startsWith("@theoryfoundry/"));
  assert.match(value, /^\d+\.\d+\.\d+$/);
}
for (const file of files)
  assert.match(
    file,
    /^package\/(?:dist\/(?:[a-zA-Z0-9_-]+\.js|assets\/(?:index\.html|proof\.js|openscad-worker\.js|vendor\/openscad\/(?:openscad\.js|openscad\.wasm|bosl2\.zip|manifest\.json)))|licenses\/[a-zA-Z0-9.-]+|package\.json|README\.md|THIRD_PARTY_NOTICES\.md)$/,
  );
const directory = await mkdtemp(join(tmpdir(), "theoryfoundry-packed-"));
assert.ok(relative(root, directory).startsWith(".."));
await mkdir(join(directory, "home"));
await mkdir(join(directory, "work"));
const registry = await startPackageRegistry(manifest, tarball);
const browserCache = join(directory, "browser-cache");
const npmrc = join(directory, "npmrc");
await writeFile(
  npmrc,
  `registry=${registry.origin}\nstore-dir=${join(directory, "store")}\n`,
);
const env = {
  PATH: process.env.PATH,
  HOME: join(directory, "home"),
  XDG_CACHE_HOME: join(directory, "cache"),
  XDG_CONFIG_HOME: join(directory, "config"),
  XDG_DATA_HOME: join(directory, "data"),
  npm_config_userconfig: npmrc,
  npm_config_registry: registry.origin,
  PLAYWRIGHT_BROWSERS_PATH: browserCache,
  CI: "true",
};
const options = {
  specifier: `${manifest.name}@${version}`,
  cwd: join(directory, "work"),
  env,
};
const checks = [
  "Tarball manifest, exact dependency pins, portable imports and allowlisted contents",
];
try {
  const result = await runPacked(["--version"], options);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), version);
  const help = await runPacked(["--help"], options);
  assert.equal(help.code, 0, help.stderr);
  assert.match(help.stdout, /setup/);
  assert.match(help.stdout, /logout/);
  checks.push(
    "Exact-version pnpm dlx resolution through a disposable registry with a fresh external home/cache/store",
  );
  const missing = await runPacked(["doctor", "--json"], {
    ...options,
    env: {
      ...env,
      PLAYWRIGHT_BROWSERS_PATH: join(directory, "absent-browser"),
    },
  });
  assert.equal(missing.code, 1, missing.stderr);
  const unavailable = JSON.parse(missing.stdout);
  assert.equal(unavailable.ok, false);
  assert.match(missing.stdout, /WORKER_SETUP_REQUIRED/);
  checks.push(
    "Doctor reports missing Chromium without installing during diagnostics",
  );
  if (!smoke) {
    for (let run = 0; run < 2; run++) {
      const setup = await runPacked(["setup"], options);
      assert.equal(setup.code, 0, setup.stderr);
      assert.equal(setup.stdout, "");
    }
    const doctor = await runPacked(["doctor", "--json"], options);
    assert.equal(doctor.code, 0, doctor.stderr);
    const healthy = JSON.parse(doctor.stdout);
    assert.equal(healthy.ok, true);
    assert.equal(
      healthy.checks.find((item) => item.check === "account").status,
      "skipped",
    );
    checks.push(
      "Cold browser download, repeated setup and doctor pass with packaged assets, real Chromium/PNG and native credential binding",
    );
  }
  for (const command of ["login", "logout"]) {
    const invalid = await runPacked(
      [command, "--server", "https://bad.example/path"],
      options,
    );
    assert.equal(invalid.code, 1);
    assert.equal(invalid.stdout, "");
  }
  if (!smoke) {
    const account = `pack-test-${createHash("sha256").update(directory).digest("hex")}`;
    const authenticated = await runPacked(
      [
        "doctor",
        "--json",
        "--server",
        registry.origin,
        "--account",
        account,
        "--allow-loopback-http",
      ],
      options,
    );
    assert.equal(authenticated.code, 1, authenticated.stderr);
    assert.match(
      authenticated.stdout,
      /LOGIN_REQUIRED|CREDENTIAL_STORE_UNAVAILABLE/,
    );
    const logout = await runPacked(
      [
        "logout",
        "--server",
        registry.origin,
        "--account",
        account,
        "--allow-loopback-http",
      ],
      options,
    );
    assert.equal(
      logout.code,
      authenticated.stdout.includes("LOGIN_REQUIRED") ? 0 : 1,
      logout.stderr,
    );
    assert.equal(logout.stdout, "");
    checks.push(
      authenticated.stdout.includes("LOGIN_REQUIRED")
        ? "Native store read for a unique synthetic account reports login required; absent-account logout is safe"
        : "Isolated-home credential access and logout fail closed with actionable CREDENTIAL_STORE_UNAVAILABLE; no plaintext fallback",
    );
  }
  const served = await runPacked(
    ["serve", "--server", "https://unreachable.invalid", "--account", "unused"],
    {
      ...options,
      env: {
        ...env,
        PLAYWRIGHT_BROWSERS_PATH: join(directory, "absent-browser"),
      },
    },
    initializeStdio,
  );
  assert.equal(served.code, 0, served.stderr);
  const messages = served.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(
    messages.find((value) => value.id === 2).result.tools.length,
    11,
  );
  assert.equal(served.stderr, "");
  checks.push(
    "Packed stdio initializes/lists eleven tools offline, emits only JSON-RPC and exits on EOF",
  );
  console.log(
    JSON.stringify(
      {
        name: manifest.name,
        version,
        tarballSha256: createHash("sha256").update(tarball).digest("hex"),
        bytes: tarball.length,
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        checks,
      },
      null,
      2,
    ),
  );
} finally {
  await registry.close();
  await rm(directory, { recursive: true, force: true });
}
