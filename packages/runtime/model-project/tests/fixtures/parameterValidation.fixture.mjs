import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { CadDomainError } from "../../dist/index.js";
import { renderer as validRenderer } from "./fileProject.fixture.mjs";
import { accept, width } from "./parameterSnapshots.fixture.mjs";

export async function exerciseParameterValidation(make) {
  let failure;
  const rendered = [];
  const repository = make({
    async validateAndRender(request) {
      rendered.push(request);
      assert.equal(
        createHash("sha256").update(request.source).digest("hex"),
        request.sourceHash,
      );
      if (failure === "CANCELLED" || failure === "RENDER_FAILED")
        throw new CadDomainError(failure, "Injected render interruption.");
      const result = await validRenderer.validateAndRender(request);
      return failure === "REJECTED"
        ? {
            ...result,
            outcome: "REJECTED",
            artifacts: [],
            diagnostics: [
              {
                code: "MODEL_ASSERTION",
                severity: "error",
                message: "Body assertion failed.",
              },
            ],
          }
        : result;
    },
  });
  const { projectId } = await repository.createProject({
    name: "Binding validation",
    description: "Explicit adoption and atomic failure",
  });
  let sequence = 0;
  let parentRevision = null;
  const propose = (document) =>
    repository.proposeModelSource({
      projectId,
      parentRevision,
      requestId: `binding-${++sequence}`,
      toolCallId: "binding",
      ...document,
    });
  const legacy = await accept(
    repository,
    await propose({ source: "width=10; cube(width);" }),
  );
  parentRevision = legacy.revisionId;
  // Adoption never discovers or strips a pre-existing declaration.
  await assert.rejects(
    propose({ modelBody: "width=10; cube(width);", parameters: [width] }),
    { code: "INVALID_PARAMETERS" },
  );
  await assert.rejects(
    propose({ source: "cube(width);", parameters: [width] }),
    { code: "INVALID_PARAMETERS" },
  );
  const body = "// exact body\r\ncube([width, 10, 5]);\n";
  const adopted = await propose({ modelBody: body, parameters: [width] });
  const first = await accept(repository, adopted);
  parentRevision = first.revisionId;
  const accepted = await repository.readModelSource(projectId);
  assert.equal(accepted.modelBody, body);
  assert.equal(rendered.at(-1).source, accepted.source);
  assert.deepEqual(accepted.parameters, [width]);
  for (const outcome of ["REJECTED", "RENDER_FAILED", "CANCELLED"]) {
    failure = outcome;
    const candidate = await propose({
      modelBody: body,
      parameters: [{ ...width, value: 30 }],
    });
    const validation = repository.validateAndRender({
      projectId,
      candidateId: candidate.candidateId,
      previewProfile: "standard",
    });
    if (outcome === "REJECTED") {
      const rejected = await validation;
      assert.equal(rejected.state, "REJECTED");
      assert.equal(rejected.diagnostics[0].code, "MODEL_ASSERTION");
    } else await assert.rejects(validation, { code: outcome });
    await assert.rejects(
      repository.promoteCandidate({
        projectId,
        candidateId: candidate.candidateId,
        expectedParentRevision: parentRevision,
      }),
      { code: "INVALID_CANDIDATE_STATE" },
    );
    assert.deepEqual(await repository.readModelSource(projectId), accepted);
    assert.equal(
      (await repository.getProjectState(projectId)).currentRevision,
      first.revisionId,
    );
  }
  failure = undefined;
  for (const parameters of [[], [{ ...width, binding: "span" }]])
    await assert.rejects(propose({ modelBody: body, parameters }), {
      code: "INVALID_PARAMETERS",
    });
  await assert.rejects(
    propose({ modelBody: accepted.source, parameters: [] }),
    { code: "INVALID_PARAMETERS" },
  );
  const stale = await propose({
    modelBody: body,
    parameters: [{ ...width, value: 40 }],
  });
  const renamedBody = body.replaceAll("width", "span");
  const renamed = await accept(
    repository,
    await propose({
      modelBody: renamedBody,
      parameters: [{ ...width, binding: "span" }],
    }),
  );
  parentRevision = renamed.revisionId;
  const renamedDocument = await repository.readModelSource(projectId);
  assert.equal(renamedDocument.modelBody, renamedBody);
  assert.match(renamedDocument.source, /span = 20;/);
  assert.doesNotMatch(renamedDocument.source, /width/);
  await assert.rejects(accept(repository, stale), { code: "STALE_REVISION" });
  assert.deepEqual(
    await repository.readModelSource(projectId),
    renamedDocument,
  );
  const removed = await accept(
    repository,
    await propose({ modelBody: "cube([20,10,5]);", parameters: [] }),
  );
  const cleared = await repository.readModelSource(projectId);
  assert.equal(cleared.source, "cube([20,10,5]);");
  assert.equal(cleared.modelBody, cleared.source);
  assert.equal(removed.parameters, undefined);
}
