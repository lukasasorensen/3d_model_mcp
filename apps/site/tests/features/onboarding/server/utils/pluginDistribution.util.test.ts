import assert from "node:assert/strict";
import test from "node:test";
import { pluginDistribution } from "../../../../../src/features/onboarding/server/utils/pluginDistribution.util";
void test("only configured public listing metadata reaches the client; publication defaults off", () => {
  assert.deepEqual(
    pluginDistribution({ DATABASE_URL: "private", SECRET: "private" }),
    { npmAvailable: false },
  );
  assert.deepEqual(
    pluginDistribution({
      THEORYFOUNDRY_PLUGIN_ORIGIN: "https://3dai.theoryfoundry.com",
      THEORYFOUNDRY_CODEX_PLUGIN_URL:
        "https://chatgpt.com/plugins/theoryfoundry",
      THEORYFOUNDRY_CODEX_NPM_AVAILABLE: "1",
      SECRET: "private",
    }),
    {
      origin: "https://3dai.theoryfoundry.com",
      codex: "https://chatgpt.com/plugins/theoryfoundry",
      npmAvailable: true,
    },
  );
  for (const value of [
    "javascript:alert(1)",
    "http://example.com/plugin",
    "https://user:secret@example.com/plugin",
    "https://localhost/plugin",
  ]) {
    assert.throws(() =>
      pluginDistribution({ THEORYFOUNDRY_CODEX_PLUGIN_URL: value }),
    );
  }
  assert.throws(
    () =>
      pluginDistribution({
        THEORYFOUNDRY_CODEX_PLUGIN_URL: "https://example.com/plugin",
      }),
    /PLUGIN_ORIGIN/,
  );
});
