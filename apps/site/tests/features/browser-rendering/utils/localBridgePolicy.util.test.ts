import assert from "node:assert/strict";
import test from "node:test";
import { localMcpBridgeEnabled } from "../../../../src/features/browser-rendering/utils/localBridgePolicy.util";

void test("local MCP bridge is opt-in and disabled in production", () => {
  assert.equal(
    localMcpBridgeEnabled({
      NODE_ENV: "development",
      THEORYFOUNDRY_LOCAL_MCP_BRIDGE: "1",
    }),
    true,
  );
  assert.equal(localMcpBridgeEnabled({ NODE_ENV: "development" }), false);
  assert.equal(
    localMcpBridgeEnabled({
      NODE_ENV: "production",
      THEORYFOUNDRY_LOCAL_MCP_BRIDGE: "1",
    }),
    false,
  );
});
