import assert from "node:assert/strict";
import { createCadToolRegistry, invokeCadTool } from "@theoryfoundry/mcp";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  ModelProjectRepository,
  CadDomainError,
  VALIDATION_POLICY_VERSION,
} from "@theoryfoundry/model-project";
import { parseBinaryStl, parseThreeMf } from "@theoryfoundry/renderer";
import { startChromiumRenderer } from "../headless-renderer/node/renderer/chromium.renderer.mjs";

const root = new URL("../../", import.meta.url);
const renderer = await startChromiumRenderer(
  new URL("dist/headless-renderer-proof/public/", root),
);
const workspaceRoot = await mkdtemp(join(tmpdir(), "parameter-acceptance-"));
const hash = (source) => createHash("sha256").update(source).digest("hex");
const evidence = [];
let cancelImmediately = false;
try {
  const repository = new ModelProjectRepository({
    workspaceRoot,
    acceptRendererProvenance: (value) =>
      JSON.stringify(value) === JSON.stringify(renderer.info.provenance),
    renderer: {
      async validateAndRender(request) {
        const result = await renderer.render({
          source: request.source,
          sourceHash: request.sourceHash,
          format: "stl",
          cancelImmediately,
        });
        if (!result.ok && result.name === "AbortError")
          throw new CadDomainError("CANCELLED", "Rendering cancelled.");
        if (!result.ok && result.failureKind !== "model")
          throw new Error(result.message);
        const shared = {
          provenance: renderer.info.provenance,
          validationPolicyVersion: VALIDATION_POLICY_VERSION,
          diagnostics: result.diagnostics ?? [],
        };
        if (!result.ok)
          return { ...shared, outcome: "REJECTED", artifacts: [] };
        const bytes = Buffer.from(result.encoded, "base64");
        const mesh = parseBinaryStl(bytes);
        return {
          ...shared,
          outcome: "VALID",
          artifacts: [
            {
              format: "stl",
              mimeType: "model/stl",
              bytes,
              triangleCount: mesh.triangleCount,
              boundingBox: mesh.boundingBox,
              tessellation: { profile: "standard" },
            },
          ],
        };
      },
    },
  });
  const { projectId } = await repository.createProject({
    name: "Generated parameter acceptance",
    description: "Pinned renderer geometry and diagnostics",
  });
  const text = 'A"B\\C\nD\rE\t雪😀; width=99; //';
  const body =
    'assert(text[1] == chr(34)); assert(text[3] == chr(92)); assert(text[5] == chr(10)); assert(text[7] == chr(13)); assert(text[9] == chr(9)); assert(text[10] == "雪"); assert(text[11] == "😀"); assert(tiny > 0); assert(huge > 1e300); assert(signed == -2.5); if(enabled) cube([width, factor*5, abs(signed)*2]);\n';
  const number = (binding, value) => ({
    id: binding,
    binding,
    label: binding,
    type: "number",
    value,
    defaultValue: value,
  });
  const parameters = [
    number("width", 30),
    number("tiny", 2.2250738585072014e-308),
    number("huge", Number.MAX_VALUE),
    number("signed", -2.5),
    {
      id: "text",
      binding: "text",
      label: "Text",
      type: "string",
      value: text,
      defaultValue: "",
    },
    {
      id: "enabled",
      binding: "enabled",
      label: "Enabled",
      type: "boolean",
      value: true,
      defaultValue: false,
    },
    {
      id: "factor",
      binding: "factor",
      label: "Factor",
      type: "enum",
      value: 2,
      defaultValue: 1,
      options: [
        { label: "One", value: 1 },
        { label: "Two", value: 2 },
      ],
    },
  ];
  let parentRevision = null;
  let sequence = 0;
  const propose = (modelBody, snapshot = parameters) =>
    repository.proposeModelSource({
      projectId,
      parentRevision,
      modelBody,
      parameters: snapshot,
      requestId: `acceptance-${++sequence}`,
      toolCallId: "parameters",
    });
  const validate = (candidate) =>
    repository.validateAndRender({
      projectId,
      candidateId: candidate.candidateId,
      previewProfile: "standard",
    });
  const promote = (candidate) =>
    repository.promoteCandidate({
      projectId,
      candidateId: candidate.candidateId,
      expectedParentRevision: candidate.parentRevision,
    });
  await assert.rejects(
    propose(
      body,
      parameters.map((parameter) =>
        parameter.id === "tiny"
          ? { ...parameter, value: Number.MIN_VALUE }
          : parameter,
      ),
    ),
    (error) =>
      error.code === "INVALID_PARAMETERS" &&
      /Nonzero magnitudes/.test(error.details.reason),
  );
  const subnormalSource = "tiny = 5e-324; cube(1);";
  const subnormal = await renderer.render({
    source: subnormalSource,
    sourceHash: hash(subnormalSource),
    format: "stl",
  });
  assert.equal(subnormal.ok, false);
  assert.equal(subnormal.failureKind, "model");
  evidence.push({
    subnormalRejectedBeforePersistence: true,
    pinnedLexerRejectsSubnormal: true,
  });
  const registry = createCadToolRegistry(repository);
  const callTool = async (name, input) => {
    const result = await invokeCadTool(registry, name, input);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.value;
  };
  for (const width of [30, 40]) {
    const snapshot = parameters.map((parameter) =>
      parameter.id === "width" ? { ...parameter, value: width } : parameter,
    );
    const candidate = (
      await callTool("edit_parameters", {
        projectId,
        parentRevision,
        requestId: `tool-acceptance-${++sequence}`,
        toolCallId: "parameters",
        ...(parentRevision === null
          ? {
              modelBody: body,
              operations: snapshot.map((parameter) => ({
                op: "create",
                parameter,
              })),
            }
          : { operations: [{ op: "set_value", id: "width", value: width }] }),
      })
    ).candidate;
    const valid = await validate(candidate);
    assert.equal(valid.state, "VALID", JSON.stringify(valid.diagnostics));
    assert.deepEqual(valid.artifacts[0].boundingBox, {
      min: [0, 0, 0],
      max: [width, 10, 5],
    });
    parentRevision = (await promote(valid)).revisionId;
    const listed = await callTool("list_model_parameters", { projectId });
    assert.equal(listed.revision, parentRevision);
    assert.equal(
      listed.parameters.find((parameter) => parameter.id === "width").value,
      width,
    );
    const document = await repository.readModelSource(projectId);
    assert.equal(document.modelBody, body);
    assert.equal(document.sourceHash, hash(document.source));
    const exported = await renderer.render({
      source: document.source,
      sourceHash: document.sourceHash,
      format: "3mf",
    });
    assert.equal(exported.ok, true, JSON.stringify(exported));
    assert.deepEqual(
      parseThreeMf(Buffer.from(exported.encoded, "base64")).boundingBox,
      valid.artifacts[0].boundingBox,
    );
    evidence.push({
      width,
      tools: ["list_model_parameters", "edit_parameters"],
      sourceHash: document.sourceHash,
      bounds: valid.artifacts[0].boundingBox,
      formats: ["stl", "3mf"],
    });
  }
  const accepted = await repository.readModelSource(projectId);
  for (const invalidBody of [
    'assert(width < 0, "width must be negative"); cube(width);',
    "cube([;",
  ]) {
    const candidate = await propose(invalidBody);
    const rejected = await validate(candidate);
    assert.equal(rejected.state, "REJECTED");
    assert.ok(rejected.diagnostics.length);
    await assert.rejects(promote(candidate), {
      code: "INVALID_CANDIDATE_STATE",
    });
    assert.deepEqual(await repository.readModelSource(projectId), accepted);
    evidence.push({ state: rejected.state, diagnostics: rejected.diagnostics });
  }
  const cancelled = await propose(`${body}// uncached cancellation\n`);
  cancelImmediately = true;
  await assert.rejects(validate(cancelled), { code: "CANCELLED" });
  cancelImmediately = false;
  assert.deepEqual(await repository.readModelSource(projectId), accepted);
  const stale = await propose(body);
  assert.equal((await validate(stale)).state, "VALID");
  const latest = await propose(body);
  assert.equal((await validate(latest)).state, "VALID");
  parentRevision = (await promote(latest)).revisionId;
  const latestDocument = await repository.readModelSource(projectId);
  await assert.rejects(promote(stale), { code: "STALE_REVISION" });
  assert.deepEqual(await repository.readModelSource(projectId), latestDocument);
  // Rendering can succeed even when a parameter is unused: never infer influence.
  const unused = await propose("cube(1);");
  assert.equal((await validate(unused)).state, "VALID");
  const imported = await propose(
    "use <BOSL2/math.scad>\ncube([width, 10, 5]);",
  );
  assert.equal((await validate(imported)).state, "VALID");
  const renamed = await propose(
    "cube([span, 10, 5]);",
    parameters.map((parameter) =>
      parameter.id === "width" ? { ...parameter, binding: "span" } : parameter,
    ),
  );
  assert.equal((await validate(renamed)).state, "VALID");
  parentRevision = (await promote(renamed)).revisionId;
  const renamedDocument = await repository.readModelSource(projectId);
  assert.match(renamedDocument.source, /span = 30;/);
  assert.doesNotMatch(renamedDocument.source, /\nwidth =/);
  const removed = await propose("cube([30, 10, 5]);", []);
  assert.equal((await validate(removed)).state, "VALID");
  await promote(removed);
  assert.equal(
    (await repository.readModelSource(projectId)).source,
    "cube([30, 10, 5]);",
  );
  assert.equal(renderer.blockedRequests.length, 0);
  evidence.push({
    cancellationPreservesAccepted: true,
    stalePreservesAccepted: true,
    unusedParameterCanRender: true,
    useImportRendered: true,
    renamedAndRemovedDeclarationsRendered: true,
  });
  const output = new URL("dist/parameter-acceptance/", root);
  await mkdir(output, { recursive: true });
  await writeFile(
    new URL("report.json", output),
    JSON.stringify(
      { ...renderer.info, evidence, blockedRequests: renderer.blockedRequests },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ ...renderer.info, evidence }));
} finally {
  try {
    await renderer.close();
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}
