import test from "node:test";
import assert from "node:assert/strict";
import { workerCli } from "../../../../src/features/cli/index.js";
import type { CommandDependencies } from "../../../../src/domains/installation/index.js";
import { fixture } from "../../../fixtures/compute.fixture.js";
import { WorkerAuthError } from "@theoryfoundry/worker-auth/errors";
function harness(): {
  deps: CommandDependencies;
  calls: string[];
  stdout: string[];
  stderr: string[];
} {
  const calls: string[] = [];
  const stdout: string[] = [];
  const stderr: string[] = [];
  const renderer = fixture().deps.renderer;
  renderer.close = async (): Promise<void> => {
    calls.push("close");
  };
  renderer.render = async (): ReturnType<typeof renderer.render> => {
    calls.push("render");
    return { ok: true, encoded: "fixture" };
  };
  return {
    calls,
    stdout,
    stderr,
    deps: {
      metadata: { name: "@theoryfoundry/local-worker", version: "1.2.3" },
      renderer,
      prepareAssets: async (): Promise<void> => {
        calls.push("assets");
      },
      configureClient: async (): Promise<{
        path: string;
        changed: boolean;
      }> => {
        calls.push("configure");
        return { path: "/fixture", changed: true };
      },
      installBrowser: async (): Promise<void> => {
        calls.push("install");
      },
      openBrowser: async (): Promise<void> => {
        calls.push("browser");
      },
      serve: async (): Promise<void> => {
        calls.push("serve");
      },
      loadAuthentication: async (
        target,
      ): ReturnType<CommandDependencies["loadAuthentication"]> => {
        calls.push("native");
        return target
          ? {
              login: async (open): Promise<string> => {
                await open("https://cad.example/authorize");
                calls.push("login");
                return "account";
              },
              logout: async (account): Promise<void> => {
                calls.push(`logout:${account}`);
              },
              accessToken: async (
                account,
              ): Promise<{
                token: string;
                account: string;
                expiresAt: number;
              }> => {
                calls.push(`token:${account}`);
                return {
                  token: "never-print-secret",
                  account,
                  expiresAt: Date.now() + 300000,
                };
              },
            }
          : undefined;
      },
      stdout: (text): void => {
        stdout.push(text);
      },
      stderr: (text): void => {
        stderr.push(text);
      },
    },
  };
}
const signal = (): AbortSignal => new AbortController().signal;
void test("help/version are side-effect free and version-pinned; serve does not setup or login", async () => {
  const f = harness();
  assert.equal(await workerCli(["--help"], f.deps, signal()), 0);
  assert.match(f.stdout.join(""), /local-worker@1.2.3/);
  assert.equal(await workerCli(["--version"], f.deps, signal()), 0);
  assert.equal(f.stdout.at(-1), "1.2.3\n");
  assert.deepEqual(f.calls, []);
  assert.equal(
    await workerCli(
      ["serve", "--server", "https://cad.example", "--account", "a"],
      f.deps,
      signal(),
    ),
    0,
  );
  assert.deepEqual(f.calls, ["serve"]);
});
void test("setup explicitly installs then verifies and closes the renderer without acquiring credentials", async () => {
  const f = harness();
  assert.equal(await workerCli(["setup"], f.deps, signal()), 0);
  assert.deepEqual(f.calls, ["assets", "install", "render", "close"]);
  assert.equal(f.stdout.length, 0);
});
void test("login/logout use the existing auth lifecycle and login prints version-pinned serve arguments", async () => {
  const f = harness();
  assert.equal(
    await workerCli(
      ["login", "--server", "https://cad.example"],
      f.deps,
      signal(),
    ),
    0,
  );
  assert.match(
    f.stderr.join(""),
    /local-worker@1.2.3 serve --server https:\/\/cad.example --account account/,
  );
  assert.equal(
    await workerCli(
      ["logout", "--server", "https://cad.example", "--account", "account"],
      f.deps,
      signal(),
    ),
    0,
  );
  assert.deepEqual(f.calls, [
    "native",
    "browser",
    "login",
    "native",
    "logout:account",
  ]);
  assert.equal(f.stdout.length, 0);
});
void test("doctor distinguishes offline runtime checks from opt-in account checks without leaking tokens", async () => {
  const f = harness();
  assert.equal(await workerCli(["doctor", "--json"], f.deps, signal()), 0);
  assert.deepEqual(f.calls, ["render", "close", "native"]);
  assert.match(f.stdout.join(""), /skipped/);
  assert.equal(
    await workerCli(
      ["doctor", "--json", "--server", "https://cad.example", "--account", "a"],
      f.deps,
      signal(),
    ),
    0,
  );
  assert.equal(f.calls.at(-1), "token:a");
  assert.doesNotMatch(
    f.stdout.join("") + f.stderr.join(""),
    /never-print-secret/,
  );
});
void test("diagnostic failures are nonzero, redacted, and close resources; auth failure remains actionable", async () => {
  const f = harness();
  f.deps.renderer.render = async (): ReturnType<
    typeof f.deps.renderer.render
  > => {
    throw new Error("sensitive-native-error");
  };
  assert.equal(await workerCli(["doctor", "--json"], f.deps, signal()), 1);
  assert.ok(f.calls.includes("close"));
  assert.doesNotMatch(f.stdout.join(""), /sensitive-native-error/);
  f.deps.loadAuthentication = async (): ReturnType<
    typeof f.deps.loadAuthentication
  > => {
    throw new WorkerAuthError("LOGIN_REQUIRED", "Log in again.");
  };
  assert.equal(
    await workerCli(
      ["logout", "--server", "https://cad.example", "--account", "a"],
      f.deps,
      signal(),
    ),
    1,
  );
  assert.match(f.stderr.join(""), /LOGIN_REQUIRED/);
});
void test("pre-cancelled commands perform no installation, login or rendering", async () => {
  const f = harness();
  const abort = new AbortController();
  abort.abort();
  assert.equal(await workerCli(["setup"], f.deps, abort.signal), 1);
  assert.deepEqual(f.calls, []);
});

void test("guided setup configures only after renderer and authentication success and can reuse an account", async () => {
  const f = harness();
  assert.equal(
    await workerCli(
      ["setup", "--server", "https://cad.example", "--client", "codex"],
      f.deps,
      signal(),
    ),
    0,
  );
  assert.deepEqual(f.calls, [
    "assets",
    "install",
    "render",
    "close",
    "native",
    "browser",
    "login",
    "configure",
  ]);
  f.calls.length = 0;
  assert.equal(
    await workerCli(
      [
        "setup",
        "--server",
        "https://cad.example",
        "--client",
        "claude",
        "--account",
        "account",
      ],
      f.deps,
      signal(),
    ),
    0,
  );
  assert.deepEqual(f.calls, [
    "assets",
    "install",
    "render",
    "close",
    "native",
    "token:account",
    "configure",
  ]);
  f.calls.length = 0;
  f.deps.loadAuthentication = async (): ReturnType<
    typeof f.deps.loadAuthentication
  > => {
    throw new WorkerAuthError("LOGIN_REQUIRED", "Log in again.");
  };
  assert.equal(
    await workerCli(
      ["setup", "--server", "https://cad.example", "--client", "codex"],
      f.deps,
      signal(),
    ),
    1,
  );
  assert.ok(!f.calls.includes("configure"));
});
