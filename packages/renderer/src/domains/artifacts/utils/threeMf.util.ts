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
  if (!/^[a-f0-9]{64}$/.test(sourceHash))
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
  if (/<metadata\s+name=["']theoryfoundry:sourceHash["']/i.test(xml))
    throw new RendererError(
      "INTEGRITY_FAILURE",
      "Renderer output attempted to supply trusted source linkage.",
    );
  const linked = xml.replace(
    /(<model\b[^>]*>)/i,
    `$1<metadata name="theoryfoundry:sourceHash">${sourceHash}</metadata>`,
  );
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
    ...relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi),
  ].filter((match) =>
    /\bType\s*=\s*["']http:\/\/schemas\.microsoft\.com\/3dmanufacturing\/2013\/01\/3dmodel["']/i.test(
      match[1] ?? "",
    ),
  );
  if (relationshipsMatches.length !== 1)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF package must declare exactly one root model relationship.",
    );
  const targetValue = relationshipsMatches[0]?.[1]?.match(
    /\bTarget\s*=\s*["']([^"']+)["']/i,
  )?.[1];
  if (
    !targetValue ||
    targetValue.includes("\\") ||
    targetValue.split("/").includes("..")
  )
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF model relationship target is unsafe or missing.",
    );
  const target = targetValue.replace(/^\//, "");
  const escapedTarget = `/${target}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (
    !/<Default\b(?=[^>]*\bExtension=["']model["'])(?=[^>]*\bContentType=["']application\/vnd\.ms-package\.3dmanufacturing-3dmodel\+xml["'])[^>]*\/?>/i.test(
      contentTypesXml,
    ) &&
    !new RegExp(
      `<Override\\b(?=[^>]*\\bPartName=["']${escapedTarget}["'])(?=[^>]*\\bContentType=["']application/vnd\\.ms-package\\.3dmanufacturing-3dmodel\\+xml["'])[^>]*/?>`,
      "i",
    ).test(contentTypesXml)
  )
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
  const root = xml.match(/<model\b([^>]*)>/i)?.[1] ?? "";
  if (!/\bunit\s*=\s*["']millimeter["']/i.test(root))
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF units must be millimeters.",
    );
  for (const match of xml.matchAll(/\btransform\s*=\s*["']([^"']+)["']/gi)) {
    const values = (match[1] ?? "").trim().split(/\s+/).map(Number);
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
    const escaped = expectedSourceHash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (
      !new RegExp(
        `<metadata\\s+name=["']theoryfoundry:sourceHash["']\\s*>\\s*${escaped}\\s*</metadata>`,
        "i",
      ).test(xml)
    ) {
      throw new RendererError(
        "INTEGRITY_FAILURE",
        "3MF source linkage is missing or mismatched.",
      );
    }
  }
  const objects = new Map<
    number,
    { vertices: Array<[number, number, number]>; triangleCount: number }
  >();
  for (const objectMatch of xml.matchAll(
    /<object\b([^>]*)>([\s\S]*?)<\/object\s*>/gi,
  )) {
    const attributes = objectMatch[1] ?? "";
    const body = objectMatch[2] ?? "";
    const id = Number(attributes.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1]);
    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      objects.has(id) ||
      !/<mesh\b/i.test(body) ||
      /<components\b/i.test(body)
    )
      throw new RendererError(
        "INVALID_ARTIFACT",
        "3MF contains an invalid or unsupported object graph.",
      );
    const vertices: Array<[number, number, number]> = [];
    for (const match of body.matchAll(/<vertex\b([^>]*)\/?\s*>/gi)) {
      const vertexAttributes = match[1] ?? "";
      const coordinate = (name: string): number =>
        Number(
          vertexAttributes.match(
            new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"),
          )?.[1],
        );
      vertices.push([coordinate("x"), coordinate("y"), coordinate("z")]);
    }
    checkedBounds(vertices);
    const triangles: Triangle[] = [];
    for (const match of body.matchAll(/<triangle\b([^>]*)\/?\s*>/gi)) {
      const triangleAttributes = match[1] ?? "";
      const indices = ["v1", "v2", "v3"].map((name) => {
        const index = Number(
          triangleAttributes.match(
            new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"),
          )?.[1],
        );
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
    objects.set(id, { vertices, triangleCount: triangles.length });
  }
  if (objects.size === 0)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF contains no validated mesh objects.",
    );
  const buildMatches = [
    ...xml.matchAll(/<build\b[^>]*>([\s\S]*?)<\/build\s*>/gi),
  ];
  if (buildMatches.length !== 1)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF must contain exactly one build graph.",
    );
  const itemMatches = [
    ...(buildMatches[0]?.[1] ?? "").matchAll(/<item\b([^>]*)\/?\s*>/gi),
  ];
  if (itemMatches.length === 0)
    throw new RendererError("INVALID_ARTIFACT", "3MF build graph is empty.");
  const builtVertices: Array<[number, number, number]> = [];
  let triangleCount = 0;
  const referenced = new Set<number>();
  for (const item of itemMatches) {
    const objectId = Number(
      (item[1] ?? "").match(/\bobjectid\s*=\s*["']([^"']+)["']/i)?.[1],
    );
    const object = objects.get(objectId);
    if (!object)
      throw new RendererError(
        "INVALID_ARTIFACT",
        "3MF build item references an invalid object.",
      );
    referenced.add(objectId);
    for (const vertex of object.vertices) builtVertices.push(vertex);
    triangleCount += object.triangleCount;
  }
  if (referenced.size !== objects.size)
    throw new RendererError(
      "INVALID_ARTIFACT",
      "3MF contains mesh objects that are not referenced by the build graph.",
    );
  return { triangleCount, boundingBox: checkedBounds(builtVertices) };
}
