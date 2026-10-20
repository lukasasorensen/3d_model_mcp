import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const workspace = resolve(import.meta.dirname, "..");
const hasCompose = spawnSync("docker", ["compose", "version"], { encoding: "utf8" }).status === 0;
const validationEnvironment = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  POSTGRES_USER: "theoryfoundry",
  POSTGRES_DB: "theoryfoundry",
  POSTGRES_PASSWORD: "validation-password",
  BETTER_AUTH_SECRET: "validation-only-secret-at-least-32-characters",
  BETTER_AUTH_URL: "https://cad.example.com",
  THEORYFOUNDRY_ALLOWED_ORIGIN: "https://cad.example.com",
};

function composeConfig(overrides = {}, extraArguments = []) {
  return spawnSync("docker", ["compose", "-f", "compose.coolify.yaml", ...extraArguments, "config", "--format", "json"], {
    cwd: workspace,
    env: { ...validationEnvironment, ...overrides },
    encoding: "utf8",
  });
}

const options = { skip: hasCompose ? false : "Docker Compose CLI is unavailable; configuration tests require Compose (no daemon needed)." };

test("Coolify startup requires healthy PostgreSQL and successful migrations", options, () => {
  const result = composeConfig();
  assert.equal(result.status, 0, result.stderr);
  const { services } = JSON.parse(result.stdout);
  assert.equal(services.app.depends_on.migrate.condition, "service_completed_successfully");
  assert.equal(services.migrate.depends_on.postgres.condition, "service_healthy");
  assert.deepEqual(services.migrate.command, ["pnpm", "db:migrate"]);
  assert.equal(services.migrate.restart, "no");
  assert.equal(services.app.environment.DATABASE_URL, services.migrate.environment.DATABASE_URL);
  assert.equal(services.app.environment.BETTER_AUTH_SECRET, services.migrate.environment.BETTER_AUTH_SECRET);
  assert.equal(services.app.environment.THEORYFOUNDRY_AUTH_ALLOW_SIGNUP, "0");
  assert.equal(services.app.environment.THEORYFOUNDRY_REMOTE_MCP_ENABLED, "0");
});

test("Coolify stack keeps database, exports, and operator tooling private", options, () => {
  const result = composeConfig();
  assert.equal(result.status, 0, result.stderr);
  const { services, networks } = JSON.parse(result.stdout);
  for (const service of Object.values(services)) {
    assert.equal(service.ports, undefined);
    assert.equal(service.container_name, undefined);
    for (const volume of service.volumes ?? []) assert.equal(volume.type, "volume");
  }
  assert.equal(networks.data.internal, true);
  assert.deepEqual(Object.keys(services.postgres.networks), ["data"]);
  assert.deepEqual(Object.keys(services.migrate.networks), ["data"]);
  assert.equal(services.app.build.context, workspace);
  assert.equal(services.app.build.target, "runtime");
  assert.equal(services.migrate.build.target, "tooling");
  assert.equal(services.postgres.image, "postgres:18.6-bookworm");
  assert.equal(services.postgres.volumes[0].source, "postgres18-data");
  assert.equal(services.postgres.volumes[0].target, "/var/lib/postgresql");
  assert.equal(services.postgres.environment.PGDATA, undefined);
  assert.equal(services.app.volumes[0].target, services.app.environment.THEORYFOUNDRY_EXPORT_DIRECTORY);
  assert.equal(services.app.environment.THEORYFOUNDRY_ACTOR_USER_ID, undefined);
});

test("Coolify rejects missing credentials and public origin configuration", options, () => {
  for (const name of ["POSTGRES_PASSWORD", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "THEORYFOUNDRY_ALLOWED_ORIGIN"]) {
    const result = composeConfig({ [name]: "" });
    assert.notEqual(result.status, 0, `${name} must be required`);
    assert.ok(result.stderr.includes(name));
  }
});
