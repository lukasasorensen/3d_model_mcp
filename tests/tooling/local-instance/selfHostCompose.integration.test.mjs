import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
test(
  "local Compose keeps persistent stores private and exposes only the loopback app",
  {
    skip: spawnSync("docker", ["compose", "version"]).error?.code === "ENOENT",
  },
  () => {
    const result = JSON.parse(
      execFileSync(
        "docker",
        [
          "compose",
          "--env-file",
          "/dev/null",
          "-f",
          "compose.self-host.yaml",
          "config",
          "--format",
          "json",
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            TF_LOCAL_PORT: "43100",
            TF_LOCAL_INSTANCE_ID: "0123456789abcdef",
            TF_LOCAL_DATABASE_PASSWORD: "test-password",
            TF_LOCAL_AUTH_SECRET: "test-auth",
            TF_LOCAL_SETUP_TOKEN: "test-setup",
            TF_LOCAL_AI_KEYS: "{}",
            TF_LOCAL_APP_IMAGE: "theoryfoundry/local-app:0.8.0",
            TF_LOCAL_TOOLING_IMAGE: "theoryfoundry/local-tooling:0.8.0",
          },
        },
      ),
    );
    assert.equal(result.services.postgres.ports, undefined);
    assert.equal(result.services.proxy.ports.length, 1);
    assert.equal(result.services.proxy.ports[0].host_ip, "127.0.0.1");
    assert.equal(result.services.proxy.ports[0].published, "43100");
    assert.equal(result.networks.private.internal, true);
    assert.deepEqual(Object.keys(result.services.app.networks), ["private"]);
    assert.equal(result.services.app.ports, undefined);
    assert.deepEqual(Object.keys(result.volumes).sort(), [
      "database",
      "erasures",
      "exports",
    ]);
    assert.equal(
      result.services.app.environment.THEORYFOUNDRY_AUTH_ALLOW_SIGNUP,
      "0",
    );
    assert.equal(
      result.services.app.environment.THEORYFOUNDRY_LOCAL_EDITION,
      "1",
    );
    assert.equal(
      result.services.app.environment.BETTER_AUTH_URL,
      "http://127.0.0.1:43100",
    );
  },
);
