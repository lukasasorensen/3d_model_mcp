import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assembleModelSource,
  checkedParameterSnapshot,
} from "../../dist/shared/utils/parameterSnapshot.util.js";
import { accept } from "./parameterSnapshots.fixture.mjs";

const width = {
  id: "width",
  binding: "width",
  label: "Width",
  type: "number",
  value: 20,
  defaultValue: 10,
};

export async function exerciseHistoricalParameterRetries(
  repository,
  rewriteStoredCandidate,
) {
  let last;
  for (const scenario of [
    {
      name: "include",
      modelBody: "include <BOSL2/std.scad>\ncube(width);",
      parameters: [width],
      inherit: true,
    },
    {
      name: "formal",
      modelBody: "module box(width) { cube(width); } box(20);",
      parameters: [width],
    },
    {
      name: "subnormal",
      modelBody: "cube(width);",
      parameters: [{ ...width, value: 1e-308 }],
    },
    { name: "removed", modelBody: "cube(width);", parameters: [] },
    {
      name: "header",
      modelBody:
        "// theoryfoundry:parameters:start v1\nwidth = 20;\n// theoryfoundry:parameters:end\ncube(width);",
      parameters: [],
    },
  ]) {
    const { projectId } = await repository.createProject({
      name: `Historical ${scenario.name}`,
      description: "Upgrade retry contract",
    });
    const parent = await accept(
      repository,
      await repository.proposeModelSource({
        projectId,
        parentRevision: null,
        modelBody: "cube(width);",
        parameters: [width],
        requestId: "parent",
        toolCallId: "parent",
      }),
    );
    const input = {
      projectId,
      parentRevision: parent.revisionId,
      modelBody: scenario.modelBody,
      parameters: scenario.inherit ? undefined : scenario.parameters,
      requestId: "historical",
      toolCallId: "historical",
    };
    const seed = await repository.proposeModelSource({
      ...input,
      modelBody: "cube(width);",
      parameters: [width],
    });
    const parameters = checkedParameterSnapshot(scenario.parameters);
    const source = assembleModelSource(scenario.modelBody, parameters);
    // Seed the persisted v1 record as accepted by the prior proposal policy,
    // without depending on an old checkout or disabling production validation.
    await rewriteStoredCandidate(
      {
        ...seed,
        modelBody: scenario.modelBody,
        parameters,
        sourceHash: createHash("sha256").update(source).digest("hex"),
        sourceBytes: Buffer.byteLength(source),
      },
      source,
    );
    assert.deepEqual(
      await repository.proposeModelSource(input),
      await repository.getCandidate(projectId, seed.candidateId),
    );
    for (const changed of [
      { requestId: "different" },
      { toolCallId: "different" },
      { modelBody: `${scenario.modelBody}\n// changed` },
      ...(parameters.length
        ? [
            {
              parameters: parameters.map((parameter) => ({
                ...parameter,
                label: "Different label",
              })),
            },
          ]
        : []),
    ])
      await assert.rejects(
        repository.proposeModelSource({ ...input, ...changed }),
        { code: "INVALID_PARAMETERS" },
      );
    if (scenario.name === "include") await accept(repository, seed);
    const current = await repository.getProjectState(projectId);
    await accept(
      repository,
      await repository.proposeModelSource({
        projectId,
        parentRevision: current.currentRevision,
        modelBody: "cube(1);",
        parameters: [],
        requestId: "advance",
        toolCallId: "advance",
      }),
    );
    const accepted = await repository.readModelSource(projectId);
    const stored = await repository.getCandidate(projectId, seed.candidateId);
    assert.equal(
      stored.state,
      scenario.name === "include" ? "PROMOTED" : "CREATED",
    );
    assert.deepEqual(await repository.proposeModelSource(input), stored);
    assert.deepEqual(await repository.readModelSource(projectId), accepted);
    last = { input, stored };
  }
  return last;
}
