import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
import {
  parseBinaryStl,
  parseThreeMf,
} from "../../packages/renderer/dist/index.js";
import { createWorkerAuthentication } from "../../packages/worker-auth/dist/index.js";
import { runLocalInstance } from "../../packages/local-worker/dist/features/local-instance/index.js";
import {
  localProcess,
  localSecrets,
} from "../../packages/local-worker/dist/infrastructure/local-instance/index.js";
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    cli: { type: "string" },
    port: { type: "string", default: "53243" },
  },
  strict: true,
});
if (!values.cli)
  throw new Error(
    "Use --cli /absolute/installed-package/dist/cli.js after building/loading the local images.",
  );
const cli = resolve(values.cli);
const require = createRequire(
  new URL("../../packages/local-worker/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const { AsyncEntry } = require("@napi-rs/keyring");
const root = await mkdtemp(join(tmpdir(), "tf-local-acceptance-"));
const home = join(root, "original");
const restoredHome = join(root, "restored");
const environment = {
  ...process.env,
  THEORYFOUNDRY_LOCAL_HOME: home,
  THEORYFOUNDRY_CONNECTION_HOME: home,
};
const signal = AbortSignal.timeout(15 * 60 * 1000);
const exec = promisify(execFile);
const command = async (args, env = environment) => {
  const { stdout } = await exec(process.execPath, [cli, ...args], {
    env,
    signal,
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout.trim());
};
let state;
let restored;
let auth;
let account;
let browser;
let phase = "start";
const checks = [];
try {
  assert.equal((await command(["local", "status", "--json"])).installed, false);
  const started = await command([
    "local",
    "start",
    "--port",
    values.port,
    "--json",
  ]);
  assert.equal(started.ready, true);
  const origin = started.origin;
  state = JSON.parse(await readFile(join(home, "installation.json"), "utf8"));
  const secrets = await localSecrets(state.id);
  assert.ok(secrets);
  phase = "browser bootstrap";
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${origin}/local-setup#token=${secrets.setup}`);
  await page.getByLabel("Name").fill("Local acceptance");
  await page.getByLabel("Email").fill("local-acceptance@example.invalid");
  await page.getByLabel("Password").fill(randomBytes(24).toString("hex"));
  await page.getByRole("button", { name: "Create local account" }).click();
  await page.waitForURL(`${origin}/projects`, { timeout: 30000 });
  const cookie = (await context.cookies())
    .map((value) => `${value.name}=${value.value}`)
    .join("; ");
  const duplicate = await fetch(`${origin}/v1/local-setup`, {
    method: "POST",
    headers: {
      origin,
      "x-theoryfoundry-setup": secrets.setup,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "Other",
      email: "other@example.invalid",
      password: "another-long-password",
    }),
  });
  assert.equal(duplicate.status, 409);
  await browser.close();
  browser = undefined;
  checks.push("actual browser first-account bootstrap and duplicate rejection");
  phase = "OAuth and Keychain";
  auth = createWorkerAuthentication(origin, { allowLoopbackHttp: true });
  account = await auth.login(async (url) => {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { cookie, origin, accept: "application/json" },
    });
    const location =
      response.headers.get("location") ?? (await response.json()).url;
    const consent = new URL(location, origin);
    assert.equal(consent.pathname, "/consent");
    const approved = await fetch(`${origin}/api/auth/oauth2/consent`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie,
        origin,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        accept: true,
        oauth_query: consent.search.slice(1),
      }),
    });
    assert.equal(approved.status, 200);
    const callback = (await approved.json()).url;
    assert.equal(new URL(callback).origin, "http://127.0.0.1:43827");
    assert.equal((await fetch(callback, { redirect: "manual" })).status, 200);
  }, signal);
  await command([
    "connect",
    "--server",
    origin,
    "--account",
    account,
    "--allow-loopback-http",
    "--json",
  ]);
  checks.push(
    "real local OAuth/PKCE consent and native Keychain, packed CLI connection",
  );
  let sequence = 0;
  const call = async (tool, input, output) => {
    const file = join(root, `input-${sequence++}.json`);
    await writeFile(file, JSON.stringify(input));
    const result = await command([
      "call",
      tool,
      "--input-file",
      file,
      ...(output ? ["--output", output] : []),
      "--json",
    ]);
    assert.equal(result.isError, false);
    return result.result;
  };
  phase = "CAD tools";
  const project = (
    await call("create_project", {
      name: "THE-50 local acceptance",
      description: "Disposable self-hosted acceptance model",
    })
  ).project;
  assert.ok(
    (await call("list_projects", {})).projects.some(
      (value) => value.projectId === project.projectId,
    ),
  );
  const candidate = (
    await call("propose_model_source", {
      projectId: project.projectId,
      parentRevision: null,
      source: "cube([12,16,20]);",
      requestId: "local-acceptance",
      toolCallId: "local-acceptance-proposal",
    })
  ).candidate;
  assert.equal(
    (
      await call("validate_and_render", {
        projectId: project.projectId,
        candidateId: candidate.candidateId,
        previewProfile: "standard",
      })
    ).candidate.state,
    "VALID",
  );
  const png = join(root, "preview.png");
  await call(
    "get_model_preview",
    { projectId: project.projectId, candidateId: candidate.candidateId },
    png,
  );
  const image = await readFile(png);
  assert.equal(image.readUInt32BE(16), 768);
  assert.equal(image.readUInt32BE(20), 768);
  const revision = (
    await call("promote_candidate", {
      projectId: project.projectId,
      candidateId: candidate.candidateId,
      expectedParentRevision: null,
    })
  ).revision;
  for (const format of ["stl", "3mf"])
    await call(
      "export_model",
      { projectId: project.projectId, revision: revision.revisionId, format },
      join(root, `model.${format}`),
    );
  for (const [format, parse] of [
    ["stl", parseBinaryStl],
    ["3mf", parseThreeMf],
  ]) {
    const mesh = parse(await readFile(join(root, `model.${format}`)));
    assert.deepEqual(mesh.boundingBox, { min: [0, 0, 0], max: [12, 16, 20] });
  }
  checks.push(
    "packed CLI project discovery/proposal/validation/PNG/promotion/verified STL and 3MF",
  );
  phase = "restart and egress";
  await command(["local", "stop"]);
  assert.equal((await command(["local", "status"])).ready, false);
  assert.equal((await command(["local", "start"])).ready, true);
  assert.equal(
    (await call("get_project_state", { projectId: project.projectId })).state
      .currentRevision,
    revision.revisionId,
  );
  const docker = localProcess(signal);
  const projectName = `theoryfoundry-local-${state.id}`;
  const container = await docker([
    "ps",
    "-q",
    "--filter",
    `label=com.docker.compose.project=${projectName}`,
    "--filter",
    "label=com.docker.compose.service=app",
  ]);
  assert.equal(container.code, 0);
  const denied = await docker([
    "exec",
    container.stdout.toString().trim(),
    "node",
    "-e",
    "fetch('https://example.com',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(1)).catch(()=>process.exit(0))",
  ]);
  assert.equal(denied.code, 0);
  checks.push(
    "restart persistence and app external-egress denial on this Docker engine",
  );
  phase = "cold backup and restore";
  const passphrase = randomBytes(32).toString("hex");
  const capabilities = {
    home,
    assets: fileURLToPath(
      new URL("../../packages/local-worker/dist/local/", import.meta.url),
    ),
    signal,
    run: docker,
    secrets: localSecrets,
    prompt: async () => passphrase,
    open: async () => undefined,
  };
  const backup = join(root, "snapshot.tfbackup");
  await runLocalInstance(
    { command: "backup", open: false, output: backup },
    capabilities,
    state.release.workerVersion,
  );
  await runLocalInstance(
    {
      command: "restore",
      open: false,
      input: backup,
      port: Number(values.port) + 1,
    },
    { ...capabilities, home: restoredHome },
    state.release.workerVersion,
  );
  restored = JSON.parse(
    await readFile(join(restoredHome, "installation.json"), "utf8"),
  );
  const restoredEnvironment = {
    ...environment,
    THEORYFOUNDRY_LOCAL_HOME: restoredHome,
    THEORYFOUNDRY_CONNECTION_HOME: restoredHome,
  };
  const resumed = await command(["local", "start"], restoredEnvironment);
  assert.equal(resumed.ready, true);
  const restoredSecrets = await localSecrets(restored.id);
  const databaseCheck = await docker([
    "exec",
    `${`theoryfoundry-local-${restored.id}`}-postgres-1`,
    "psql",
    "-U",
    "theoryfoundry",
    "-d",
    "theoryfoundry",
    "-tAc",
    "SELECT count(*) FROM projects",
  ]);
  assert.equal(databaseCheck.code, 0);
  assert.equal(databaseCheck.stdout.toString().trim(), "1");
  assert.equal(restoredSecrets.auth, secrets.auth);
  checks.push(
    "encrypted cold backup and isolated restored database/artifacts/secrets startup",
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        worker: state.release.workerVersion,
        application: state.release.version,
        checks,
        limitations: [
          "OAuth consent was driven by HTTP in the harness; no real Codex plugin invocation or public registry delivery is claimed.",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  const diagnostic =
    typeof error?.stderr === "string"
      ? error.stderr.split("\n").find((line) => /^[A-Z_]+:/.test(line))
      : error instanceof Error && /^[A-Z_]+:/.test(error.message)
        ? error.message
        : undefined;
  console.error(
    `Local acceptance failed during ${phase}: ${diagnostic ?? (error instanceof Error ? error.name : "unknown error")}.`,
  );
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  if (account)
    await auth
      ?.logout(account, AbortSignal.timeout(10000))
      .catch(() => undefined);
  if (account && state)
    await new AsyncEntry(
      "TheoryFoundry Worker",
      createHash("sha256")
        .update(JSON.stringify([`http://127.0.0.1:${state.port}`, account]))
        .digest("hex"),
    )
      .deleteCredential()
      .catch(() => undefined);
  const cleanupSignal = AbortSignal.timeout(30000);
  const docker = localProcess(cleanupSignal);
  for (const directory of [home, restoredHome]) {
    let installation;
    try {
      installation = JSON.parse(
        await readFile(join(directory, "installation.json"), "utf8"),
      );
    } catch {
      continue;
    }
    const credentials = await localSecrets(installation.id).catch(
      () => undefined,
    );
    if (credentials) {
      const env = {
        TF_LOCAL_INSTANCE_ID: installation.id,
        TF_LOCAL_PORT: String(installation.port),
        TF_LOCAL_DATABASE_PASSWORD: credentials.database,
        TF_LOCAL_AUTH_SECRET: credentials.auth,
        TF_LOCAL_SETUP_TOKEN: credentials.setup,
        TF_LOCAL_AI_KEYS: JSON.stringify({ local: credentials.ai }),
        TF_LOCAL_APP_IMAGE: installation.release.appImage,
        TF_LOCAL_TOOLING_IMAGE: installation.release.toolingImage,
      };
      const cleaned = await docker(
        [
          "compose",
          "--project-name",
          `theoryfoundry-local-${installation.id}`,
          "--env-file",
          "/dev/null",
          "-f",
          fileURLToPath(
            new URL("../../compose.self-host.yaml", import.meta.url),
          ),
          "down",
          "--volumes",
          "--remove-orphans",
        ],
        { environment: env },
      ).catch(() => ({ code: 1 }));
      if (cleaned.code !== 0)
        console.error(
          `Cleanup pending for disposable installation ${installation.id}.`,
        );
      else
        await new AsyncEntry("TheoryFoundry Local Instance", installation.id)
          .deleteCredential()
          .catch(() => undefined);
    }
  }
  await rm(root, { recursive: true, force: true });
}
