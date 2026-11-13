import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

export const width = {
  id: "width-id",
  binding: "width",
  type: "number",
  label: "Width",
  value: 20,
  defaultValue: 10,
  min: 1,
  max: 100,
  step: 1,
  control: "slider",
  unit: "mm",
};
export const source = (value = 20) =>
  `// theoryfoundry:parameters:start v1\nwidth = ${value};\n// theoryfoundry:parameters:end\ncube([width,10,5]);`;

export async function memoryPool(beforeLastMigration) {
  const database = new PGlite();
  const directory = new URL("../../drizzle/", import.meta.url);
  const { entries } = JSON.parse(
    await readFile(new URL("meta/_journal.json", directory), "utf8"),
  );
  for (const entry of entries) {
    if (entry === entries.at(-1)) await beforeLastMigration?.(database);
    await database.exec(
      await readFile(new URL(`${entry.tag}.sql`, directory), "utf8"),
    );
  }
  const query = (sql, params) => database.query(sql, params);
  return {
    query,
    connect: async () => ({ query, release: () => {} }),
    end: () => database.close(),
  };
}

export async function accept(repository, candidate) {
  await repository.validateAndRender({
    projectId: candidate.projectId,
    candidateId: candidate.candidateId,
    previewProfile: "standard",
  });
  return repository.promoteCandidate({
    projectId: candidate.projectId,
    candidateId: candidate.candidateId,
    expectedParentRevision: candidate.parentRevision,
  });
}

export async function exerciseSnapshots(makeRepository) {
  let repository = makeRepository();
  const { projectId } = await repository.createProject({
    name: "Parameterized bracket",
    description: "Snapshot contract",
  });
  const input = {
    projectId,
    parentRevision: null,
    source: source(),
    parameters: [width],
    requestId: "first",
    toolCallId: "first",
  };
  const candidate = await repository.proposeModelSource(input);
  assert.deepEqual(candidate.parameters, [width]);
  assert.deepEqual(await repository.proposeModelSource(input), candidate);
  const relabeled = await repository.proposeModelSource({
    ...input,
    parameters: [{ ...width, label: "Bracket width" }],
  });
  assert.notEqual(relabeled.candidateId, candidate.candidateId);
  const first = await accept(repository, candidate);
  assert.deepEqual(first.parameters, [width]);
  assert.deepEqual(
    (await repository.readModelSource(projectId, first.revisionId)).parameters,
    [width],
  );
  assert.equal(
    (await repository.getProjectState(projectId)).parameters[0].defaultValue,
    10,
  );
  repository = makeRepository();
  assert.deepEqual((await repository.listRevisions(projectId))[0].parameters, [
    width,
  ]);
  assert.equal(
    (await repository.proposeModelSource(input)).candidateId,
    candidate.candidateId,
  );
  const inherited = await repository.proposeModelSource({
    ...input,
    parentRevision: first.revisionId,
    parameters: undefined,
    requestId: "inherit",
  });
  assert.deepEqual(inherited.parameters, [width]);
  await assert.rejects(
    repository.proposeModelSource({
      ...input,
      parentRevision: first.revisionId,
      parameters: undefined,
      source: source(30),
      requestId: "bad-inherit",
    }),
    { code: "INVALID_PARAMETERS" },
  );
  for (const parameters of [
    null,
    [{ ...width, value: 30 }],
    [{ ...width, value: "20" }],
    [{ ...width, defaultValue: 200 }],
    [width, width],
  ])
    await assert.rejects(
      repository.proposeModelSource({
        ...input,
        parameters,
        parentRevision: first.revisionId,
        requestId: "invalid",
      }),
      { code: "INVALID_PARAMETERS" },
    );
  assert.equal(
    (await repository.getProjectState(projectId)).currentRevision,
    first.revisionId,
  );
  const changed = await repository.proposeModelSource({
    ...input,
    parentRevision: first.revisionId,
    source: source(30),
    parameters: [{ ...width, value: 30 }],
    requestId: "changed",
  });
  const second = await accept(repository, changed);
  assert.equal(second.parameters[0].value, 30);
  assert.equal(second.parameters[0].defaultValue, 10);
  const retry = {
    ...input,
    parentRevision: first.revisionId,
    parameters: undefined,
    requestId: "inherit",
  };
  assert.equal(
    (await repository.proposeModelSource(retry)).candidateId,
    inherited.candidateId,
  );
  await assert.rejects(accept(repository, inherited), {
    code: "STALE_REVISION",
  });
  assert.equal(
    (await repository.getProjectState(projectId)).parameters[0].value,
    30,
  );
  const restored = await repository.restoreRevision({
    projectId,
    revision: first.revisionId,
    requestId: "restore",
    toolCallId: "restore",
  });
  assert.deepEqual(restored.parameters, [width]);
  assert.equal(restored.parentRevision, second.revisionId);
  assert.equal((await repository.readModelSource(projectId)).source, source());
  const clear = await repository.proposeModelSource({
    ...input,
    parentRevision: restored.revisionId,
    parameters: [],
    requestId: "remove",
  });
  const cleared = await accept(repository, clear);
  assert.equal(cleared.parameters, undefined);
  assert.equal(
    (await repository.getProjectState(projectId)).parameters,
    undefined,
  );
  assert.equal((await repository.readModelSource(projectId)).source, source());
  return { projectId, first, candidate };
}
