import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { PostgresProjectNotifications } from "../dist/project-notifications.js";

function connection() {
  const client = new EventEmitter();
  client.released = false;
  client.commands = [];
  client.query = async (sql) => { client.commands.push(sql); return { rows: [] }; };
  client.release = () => { client.released = true; };
  return client;
}

test("notification subscribers share LISTEN and release the connection after the last subscriber", async () => {
  const client = connection();
  let connections = 0;
  const source = new PostgresProjectNotifications({ connect: async () => { connections++; return client; } });
  const first = [], second = [];
  const [stopFirst, stopSecond] = await Promise.all([source.subscribe((event) => first.push(event)), source.subscribe((event) => second.push(event))]);
  assert.equal(connections, 1); assert.deepEqual(client.commands, ["LISTEN rjls_changes"]);
  const event = { kind: "project", ownerId: "owner", projectId: "project" };
  client.emit("notification", { channel: "rjls_changes", payload: JSON.stringify(event) });
  assert.deepEqual(first.at(-1), event); assert.deepEqual(second.at(-1), event);
  stopFirst(); assert.equal(client.released, false);
  stopSecond(); assert.equal(client.released, true); source.close();
});

test("listener loss invalidates subscribers and a fresh connection establishes LISTEN again", async () => {
  const clients = [connection(), connection()];
  const source = new PostgresProjectNotifications({ connect: async () => clients.shift() });
  const original = clients[0];
  const events = [];
  const stop = await source.subscribe((event) => events.push(event));
  original.emit("error", new Error("connection lost"));
  assert.equal(events.at(-1), null); assert.equal(original.released, true);
  const replacement = clients[0];
  const stopNext = await source.subscribe(() => undefined);
  assert.deepEqual(replacement.commands, ["LISTEN rjls_changes"]);
  stop(); stopNext(); source.close();
});

test("failed listener startup releases its connection and can be retried", async () => {
  const client = connection();
  client.query = async () => { throw new Error("LISTEN failed"); };
  const source = new PostgresProjectNotifications({ connect: async () => client });
  await assert.rejects(source.subscribe(() => undefined), /LISTEN failed/);
  assert.equal(client.released, true); source.close();
});
