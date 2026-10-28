import { VALIDATION_POLICY_VERSION } from "@theoryfoundry/model-project";
import { parseBinaryStl, parseThreeMf } from "@theoryfoundry/renderer";
import { provenance } from "./canonicalDemo.fixture.mjs";
import { binaryStl, threeMf } from "./meshFormats.fixture.mjs";
import { geometry } from "./meshGeometry.fixture.mjs";
export const deterministicRenderCache = new Map();

export class TestOnlyDeterministicProductionRenderer {
  async validateAndRender(request) {
    const cached = deterministicRenderCache.get(request.sourceHash);
    if (cached) return cached;
    const triangles = geometry(request.source),
      stl = binaryStl(triangles),
      mf = threeMf(triangles, request.sourceHash),
      parsed = parseBinaryStl(stl);
    parseThreeMf(mf, request.sourceHash);
    const result = {
      outcome: "VALID",
      diagnostics: [],
      provenance,
      validationPolicyVersion: VALIDATION_POLICY_VERSION,
      artifacts: [
        {
          format: "stl",
          bytes: stl,
          mimeType: "model/stl",
          triangleCount: parsed.triangleCount,
          boundingBox: parsed.boundingBox,
          tessellation: { fixture: true, $fn: 48 },
        },
        {
          format: "3mf",
          bytes: mf,
          mimeType: "model/3mf",
          triangleCount: parsed.triangleCount,
          boundingBox: parsed.boundingBox,
          tessellation: { fixture: true, $fn: 48 },
        },
      ],
    };
    deterministicRenderCache.set(request.sourceHash, result);
    return result;
  }
}

export class FixtureClassifyingRenderer extends TestOnlyDeterministicProductionRenderer {
  async validateAndRender(request) {
    const rejection =
      /difference\(\s*\{|1000000000|\$fn\s*=\s*800|WARNING:/.test(
        request.source,
      );
    if (rejection)
      return {
        outcome: "REJECTED",
        diagnostics: [
          {
            code: "FIXTURE_REJECTED",
            severity: "error",
            message: "Hostile fixture rejected by deterministic policy.",
          },
        ],
        provenance,
        validationPolicyVersion: VALIDATION_POLICY_VERSION,
        artifacts: [],
      };
    return super.validateAndRender(request);
  }
}
