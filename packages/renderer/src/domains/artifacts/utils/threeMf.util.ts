import { threeMfOpeningTags, threeMfSections } from "./threeMfXml.util.js";
import { RendererError } from "./rendererError.util.js";
import { unzip } from "./readZip.util.js";
import { writeZip } from "./writeZip.util.js";
import { type ParsedMesh, type Triangle } from "../artifact.types.js";
import { checkedBounds } from "./meshBounds.util.js";
import { assertClosedOrientedManifold } from "./meshTopology.util.js";
import { CAD_LIMITS } from "@theoryfoundry/contracts";

/** Adds controller-owned linkage; model source cannot choose or forge this value. */
export function bindThreeMfSource(
  bytes: Uint8Array,
  sourceHash: string,
): Uint8Array {
  if (!isSourceHash(sourceHash))
    throw new RendererError(
      "INTEGRITY_FAILURE",
      "Source linkage hash is invalid.",
    );
  const entries = unzip(bytes);
  const model = entries.find((entry) =>
    entry.name.toLowerCase().endsWith(".model"),
  );
  if (!model)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF package has no model part.",
    );
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(model.bytes);
  if (containsSourceLink(xml))
    throw new RendererError(
      "INTEGRITY_FAILURE",
      "Renderer output attempted to supply trusted source linkage.",
    );
  const linked = insertSourceLink(xml, sourceHash);
  if (linked === xml)
    throw new RendererError("INVALID_ARTIFACT", "3MF model root is malformed.");
  model.bytes = new TextEncoder().encode(linked);
  return writeZip(entries);
}

export function parseThreeMf(
  bytes: Uint8Array,
  expectedSourceHash?: string,
): ParsedMesh {
  if (bytes.byteLength > CAD_LIMITS.exportBytes)
    throw new RendererError("RESOURCE_LIMIT", "3MF exceeds the byte budget.");
  const entries = unzip(bytes);
  const contentTypes = entries.find(
    (entry) => entry.name === "[Content_Types].xml",
  );
  const relationships = entries.find((entry) => entry.name === "_rels/.rels");
  if (!contentTypes || !relationships)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF package relationships are incomplete.",
    );
  const contentTypesXml = new TextDecoder("utf-8", { fatal: true }).decode(
    contentTypes.bytes,
  );
  const relationshipsXml = new TextDecoder("utf-8", { fatal: true }).decode(
    relationships.bytes,
  );
  const relationshipsMatches = [
    ...threeMfOpeningTags(relationshipsXml, "Relationship"),
  ].filter(isModelRelationship);
  if (relationshipsMatches.length !== 1)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF package must declare exactly one root model relationship.",
    );
  const targetValue = readAttribute(relationshipsMatches[0] ?? "", "Target");
  if (
    !targetValue ||
    targetValue.includes("\\") ||
    targetValue.split("/").includes("..")
  )
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF model relationship target is unsafe or missing.",
    );
  const target = targetValue.startsWith("/")
    ? targetValue.slice(1)
    : targetValue;
  let defaultType = false;
  for (const attributes of threeMfOpeningTags(contentTypesXml, "Default")) {
    if (declaresModelExtension(attributes) && hasModelContentType(attributes))
      defaultType = true;
  }
  let overrideType = false;
  for (const attributes of threeMfOpeningTags(contentTypesXml, "Override")) {
    if (
      readPartName(attributes) === `/${target}` &&
      hasModelContentType(attributes)
    )
      overrideType = true;
  }
  if (!defaultType && !overrideType)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF content types do not declare the related model part.",
    );
  const model = target
    ? entries.find((entry) => entry.name === target)
    : undefined;
  if (!model)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF package has no model part.",
    );
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(model.bytes);
  const root = threeMfOpeningTags(xml, "model").next().value ?? "";
  if (!usesMillimeters(root))
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF units must be millimeters.",
    );
  for (const values of readTransforms(xml)) {
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    if (
      values.length !== 12 ||
      values.some(
        (value, index) => !Number.isFinite(value) || value !== identity[index],
      )
    )
      throw new RendererError(
        "INVALID_ARTIFACT",
        "3MF contains an unsupported non-identity transform.",
      );
  }
  if (expectedSourceHash) {
    if (!hasExpectedSourceLink(xml, expectedSourceHash)) {
      throw new RendererError(
        "INTEGRITY_FAILURE",
        "3MF source linkage is missing or mismatched.",
      );
    }
  }
  const objects = new Map<
    number,
    { boundingBox: ParsedMesh["boundingBox"]; triangleCount: number }
  >();
  for (const { attributes, body } of threeMfSections(xml, "object")) {
    const id = Number(readAttribute(attributes, "id"));
    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      objects.has(id) ||
      !containsMesh(body) ||
      containsComponents(body)
    )
      throw new RendererError(
        "INVALID_ARTIFACT",
        "3MF contains an invalid or unsupported object graph.",
      );
    const vertices: Array<[number, number, number]> = [];
    for (const vertexAttributes of threeMfOpeningTags(body, "vertex")) {
      const coordinate = (name: "x" | "y" | "z"): number =>
        Number(readAttribute(vertexAttributes, name));
      vertices.push([coordinate("x"), coordinate("y"), coordinate("z")]);
    }
    const boundingBox = checkedBounds(vertices);
    const triangles: Triangle[] = [];
    for (const triangleAttributes of threeMfOpeningTags(body, "triangle")) {
      const indices = (["v1", "v2", "v3"] as const).map((name) => {
        const index = Number(readAttribute(triangleAttributes, name));
        if (!Number.isInteger(index) || index < 0 || index >= vertices.length)
          throw new RendererError(
            "INVALID_ARTIFACT",
            "3MF triangle references an invalid vertex.",
          );
        return index;
      }) as [number, number, number];
      triangles.push(indices);
    }
    if (triangles.length === 0)
      throw new RendererError(
        "INVALID_ARTIFACT",
        "3MF object contains no triangles.",
      );
    assertClosedOrientedManifold(vertices, triangles);
    objects.set(id, { boundingBox, triangleCount: triangles.length });
  }
  if (objects.size === 0)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF contains no validated mesh objects.",
    );
  const buildMatches = [...threeMfSections(xml, "build")];
  if (buildMatches.length !== 1)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF must contain exactly one build graph.",
    );
  const itemMatches = [
    ...threeMfOpeningTags(buildMatches[0]?.body ?? "", "item"),
  ];
  if (itemMatches.length === 0)
    throw new RendererError("INVALID_ARTIFACT", "3MF build graph is empty.");
  const builtVertices: Array<[number, number, number]> = [];
  let triangleCount = 0;
  const referenced = new Set<number>();
  for (const item of itemMatches) {
    const objectId = Number(readAttribute(item, "objectid"));
    const object = objects.get(objectId);
    if (!object)
      throw new RendererError(
        "INVALID_ARTIFACT",
        "3MF build item references an invalid object.",
      );
    if (!referenced.has(objectId)) {
      builtVertices.push(object.boundingBox.min, object.boundingBox.max);
      referenced.add(objectId);
    }
    triangleCount += object.triangleCount;
  }
  if (referenced.size !== objects.size)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF contains mesh objects that are not referenced by the build graph.",
    );
  return { triangleCount, boundingBox: checkedBounds(builtVertices) };
}

function isSourceHash(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function containsSourceLink(xml: string): boolean {
  return /<metadata\s+name=["']theoryfoundry:sourceHash["']/i.test(xml);
}

function insertSourceLink(xml: string, sourceHash: string): string {
  return xml.replace(
    /(<model\b[^>]*>)/i,
    `$1<metadata name="theoryfoundry:sourceHash">${sourceHash}</metadata>`,
  );
}

function hasExpectedSourceLink(xml: string, sourceHash: string): boolean {
  const escaped = escapePatternText(sourceHash);
  return new RegExp(
    `<metadata\\s+name=["']theoryfoundry:sourceHash["']\\s*>\\s*${escaped}\\s*</metadata>`,
    "i",
  ).test(xml);
}

function escapePatternText(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isModelRelationship(attributes: string): boolean {
  return /\bType\s*=\s*["']http:\/\/schemas\.microsoft\.com\/3dmanufacturing\/2013\/01\/3dmodel["']/i.test(
    attributes,
  );
}

function readAttribute(
  attributes: string,
  name: "Target" | "id" | "objectid" | "x" | "y" | "z" | "v1" | "v2" | "v3",
): string | undefined {
  return attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"),
  )?.[1];
}

function declaresModelExtension(attributes: string): boolean {
  return /\bExtension=["']model["']/i.test(attributes);
}

function hasModelContentType(attributes: string): boolean {
  return /\bContentType=["']application\/vnd\.ms-package\.3dmanufacturing-3dmodel\+xml["']/i.test(
    attributes,
  );
}

function readPartName(attributes: string): string | undefined {
  return attributes.match(/\bPartName=["']([^"']+)["']/i)?.[1];
}

function usesMillimeters(attributes: string): boolean {
  return /\bunit\s*=\s*["']millimeter["']/i.test(attributes);
}

function* readTransforms(xml: string): Generator<number[]> {
  for (const match of xml.matchAll(/\btransform\s*=\s*["']([^"']+)["']/gi)) {
    yield (match[1] ?? "").trim().split(/\s+/).map(Number);
  }
}

function containsMesh(xml: string): boolean {
  return /<mesh\b/i.test(xml);
}

function containsComponents(xml: string): boolean {
  return /<components\b/i.test(xml);
}
