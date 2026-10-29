import test from "node:test";
import assert from "node:assert/strict";
import { parseWorkerCommand } from "../../../../src/features/cli/index.js";
void test("CLI requires explicit command-specific origin/account and rejects credentials, duplicate flags and noncanonical origins", () => {
  assert.deepEqual(parseWorkerCommand(["setup"]), { command: "setup" });
  assert.deepEqual(parseWorkerCommand(["doctor", "--json"]), {
    command: "doctor",
    json: true,
  });
  for (const args of [
    ["serve"],
    ["login", "--server", "https://cad.example", "--account", "a"],
    ["setup", "--server", "https://cad.example"],
    [
      "serve",
      "--server",
      "https://cad.example",
      "--account",
      "a",
      "--token",
      "secret",
    ],
    [
      "login",
      "--server",
      "https://cad.example",
      "--server",
      "https://other.example",
    ],
    ["doctor", "--server", "https://cad.example"],
  ])
    assert.throws(() => parseWorkerCommand(args));
  for (const origin of [
    "https://cad.example/",
    "https://u:p@cad.example",
    "http://cad.example",
    "https://cad.example/path",
    "https://cad.example#fragment",
    "invalid",
  ])
    assert.throws(() => parseWorkerCommand(["login", "--server", origin]));
  assert.throws(() =>
    parseWorkerCommand(["login", "--server", "http://localhost:3000"]),
  );
  const local = parseWorkerCommand([
    "serve",
    "--server",
    "http://localhost:3000",
    "--account",
    "a",
    "--allow-loopback-http",
  ]);
  assert.equal(local.command, "serve");
});
