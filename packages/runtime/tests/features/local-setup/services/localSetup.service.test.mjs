import test from "node:test";
import assert from "node:assert/strict";
import { LocalSetupService } from "../../../../dist/features/local-setup/services/localSetup.service.js";
test("busy and initialized setup never call signup, and every acquired connection is released", async () => {
  for (const acquired of [false, true]) {
    let released = false;
    let signed = false;
    const queries = [];
    const service = new LocalSetupService(
      {
        connect: async () => ({
          query: async (sql) => {
            queries.push(sql);
            return { rows: [{ acquired, present: true }] };
          },
          release: () => {
            released = true;
          },
        }),
      },
      async () => {
        signed = true;
        return Response.json({});
      },
    );
    assert.equal(
      (
        await service.create({
          email: "local@example.com",
          password: "a long password",
          name: "Local",
        })
      ).status,
      409,
    );
    assert.equal(signed, false);
    assert.equal(released, true);
    assert.equal(
      queries.some((sql) => sql.includes("pg_advisory_unlock")),
      acquired,
    );
  }
});
