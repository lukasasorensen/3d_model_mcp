import test from "node:test";
import assert from "node:assert/strict";
import { createCredentialStore } from "../../../dist/infrastructure/authentication/credentialStore.adapter.js";
test("OS entries separate origin/account, validate stored binding, and redact backend errors", async () => {
  const values = new Map();
  let fail = false;
  const factory = (service, account) => {
    const key = service + account;
    return {
      async getPassword() {
        if (fail) throw new Error("secret-native-diagnostic");
        return values.get(key) ?? null;
      },
      async setPassword(value) {
        values.set(key, value);
      },
      async deleteCredential() {
        return values.delete(key);
      },
    };
  };
  const a = createCredentialStore("https://one.example", factory);
  const b = createCredentialStore("https://two.example", factory);
  const saved = {
    version: 1,
    origin: "https://one.example",
    account: "owner",
    refreshToken: "secret",
    generation: "v1",
  };
  await a.write(saved);
  assert.deepEqual(await a.read("owner"), saved);
  assert.equal(await b.read("owner"), null);
  assert.equal(await a.read("other"), null);
  assert.equal([...values.keys()][0].includes("owner"), false);
  await assert.rejects(b.write(saved), { code: "INVALID_CREDENTIAL" });
  values.set(
    [...values.keys()][0],
    JSON.stringify({ ...saved, origin: "https://other.example" }),
  );
  await assert.rejects(a.read("owner"), { code: "INVALID_CREDENTIAL" });
  fail = true;
  await assert.rejects(
    a.read("owner"),
    (error) =>
      error.code === "CREDENTIAL_STORE_UNAVAILABLE" &&
      !String(error).includes("secret-native"),
  );
  fail = false;
  await a.remove("owner");
  assert.equal(await a.read("owner"), null);
});
