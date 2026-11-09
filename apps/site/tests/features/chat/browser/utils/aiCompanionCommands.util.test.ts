import assert from "node:assert/strict";
import test from "node:test";
import { aiCompanionCommands } from "../../../../../src/features/chat/browser/utils/aiCompanionCommands.util";

for (const origin of [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://[::1]:3000",
]) {
  void test(`AI setup opts into loopback HTTP for ${origin}`, () => {
    const commands = aiCompanionCommands(origin, "owner", "0.2.0").split("\n");
    assert.equal(commands.length, 2);
    for (const command of commands) {
      assert.ok(command.endsWith(" --allow-loopback-http"));
      assert.ok(command.includes(`--server '${origin}'`));
    }
    assert.ok(commands[1]!.includes("--account 'owner'"));
    assert.ok(commands[0]!.includes(" login --server "));
    assert.ok(commands[1]!.includes(" ai serve --server "));
  });
}
void test("HTTPS and non-loopback origins do not receive the loopback opt-in", () => {
  for (const origin of [
    "https://example.test",
    "https://localhost:3000",
    "http://example.test",
  ])
    assert.ok(
      !aiCompanionCommands(origin, "owner", "0.2.0").includes(
        "--allow-loopback-http",
      ),
    );
});
