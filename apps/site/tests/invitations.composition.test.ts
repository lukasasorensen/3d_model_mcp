import assert from "node:assert/strict";
import test from "node:test";
import { handleInviteAcceptance } from "../src/invitations.composition";

const origin =
  process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000";
const url = new URL("/v1/invitations/accept", origin);

void test("redemption rejects oversized declared bodies without reading them", async () => {
  const req = new Request(url, {
    method: "POST",
    headers: { origin, "content-length": "8193" },
    body: "{}",
  });
  const res = await handleInviteAcceptance(req);
  assert.equal(res.status, 413);
  assert.equal(req.bodyUsed, false);
  assert.equal(res.headers.get("cache-control"), "no-store");
});

void test("redemption stops reading chunked or understated bodies at the byte limit", async () => {
  for (const headers of [
    new Headers({ origin }),
    new Headers({ origin, "content-length": "2" }),
  ]) {
    let reads = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller): void {
          reads++;
          controller.enqueue(new Uint8Array(4096));
        },
        cancel(): void {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const init = { method: "POST", headers, body, duplex: "half" };
    const res = await handleInviteAcceptance(new Request(url, init));
    assert.equal(res.status, 413);
    assert.equal(reads, 3);
    assert.ok(cancelled);
  }
});

void test("redemption parses a body exactly at the limit and rejects invalid fields", async () => {
  const body = "{}".padEnd(8192);
  const res = await handleInviteAcceptance(
    new Request(url, { method: "POST", headers: { origin }, body }),
  );
  assert.equal(res.status, 400);
  const result = (await res.json()) as { error: { message: string } };
  assert.match(result.error.message, /name and password/);
});
