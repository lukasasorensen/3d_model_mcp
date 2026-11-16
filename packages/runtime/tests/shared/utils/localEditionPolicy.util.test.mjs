import test from "node:test";
import assert from "node:assert/strict";
import { localEditionOrigin } from "../../../dist/shared/utils/localEditionPolicy.util.js";
import { remoteMcpIdentity } from "../../../dist/shared/utils/remoteMcpPolicy.util.js";
test("production HTTP is allowed only for an explicitly selected matching loopback edition", () => {
  const env = {
    NODE_ENV: "production",
    THEORYFOUNDRY_LOCAL_EDITION: "1",
    BETTER_AUTH_URL: "http://127.0.0.1:43100",
    THEORYFOUNDRY_ALLOWED_ORIGIN: "http://127.0.0.1:43100",
  };
  assert.equal(localEditionOrigin(env), env.BETTER_AUTH_URL);
  assert.equal(
    remoteMcpIdentity(env).issuer,
    `${env.BETTER_AUTH_URL}/api/auth`,
  );
  assert.throws(() =>
    remoteMcpIdentity({ ...env, THEORYFOUNDRY_LOCAL_EDITION: "0" }),
  );
  for (const origin of [
    "http://example.com",
    "https://127.0.0.1:43100",
    "http://127.0.0.1:43100/path",
    "http://127.0.0.1:43100/",
  ])
    assert.throws(() =>
      localEditionOrigin({
        ...env,
        BETTER_AUTH_URL: origin,
        THEORYFOUNDRY_ALLOWED_ORIGIN: origin,
      }),
    );
});
