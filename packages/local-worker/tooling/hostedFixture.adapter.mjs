import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export function hostedFixture(provenance) {
  let source =
    "difference(){cube([30,20,10],center=true);translate([6,0,0])cylinder(h=12,r=3,center=true,$fn=32);}";
  let candidate;
  let exportLease;
  let cancellations = 0;
  const artifacts = [];
  const deadline = () => new Date(Date.now() + 110_000).toISOString();
  return {
    artifacts,
    get cancellations() {
      return cancellations;
    },
    setSource(value) {
      source = value;
    },
    callHosted: async (name) => {
      assert.equal(name, "get_project_state");
      const result = {
        state: {
          projectId: "project",
          currentRevision: null,
          source: null,
          artifacts: [],
          diagnostics: [],
          rendererAvailability: "unavailable",
        },
      };
      return {
        structuredContent: result,
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
    api: {
      async json(path, body) {
        if (path.endsWith("/cancel")) {
          cancellations++;
          return {};
        }
        if (path === "validation/begin")
          return {
            version: "1",
            projectId: "project",
            candidateId: "candidate",
            jobId: "job",
            attemptId: "attempt",
            token: "a".repeat(64),
            source,
            sourceHash: hash(source),
            deadline: deadline(),
            validationPolicyVersion: provenance.validationPolicyVersion,
            executionOrigin: "local-worker",
          };
        if (path === "validation/complete") {
          assert.equal(body.sourceHash, hash(source));
          candidate = {
            version: "1",
            projectId: "project",
            candidateId: "candidate",
            parentRevision: null,
            sourceHash: hash(source),
            sourceBytes: Buffer.byteLength(source),
            state: body.result.outcome,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            requestId: "request",
            toolCallId: "call",
            diagnostics: body.result.diagnostics,
            renderer: body.result.provenance,
            ...(body.result.geometry ? { geometry: body.result.geometry } : {}),
          };
          return {
            version: "1",
            jobId: "job",
            state: "COMPLETED",
            deadline: deadline(),
            candidate,
            executionOrigin: "local-worker",
          };
        }
        if (path === "preview/source") {
          assert.equal(candidate.state, "VALID");
          return {
            version: "1",
            projectId: "project",
            candidateId: "candidate",
            source,
            sourceHash: hash(source),
            renderer: provenance,
          };
        }
        if (path === "exports/begin") {
          exportLease = {
            version: "1",
            projectId: "project",
            revisionId: "revision",
            format: body.format,
            jobId: "export-job",
            exportId: "export",
            token: "b".repeat(64),
            sourceHash: hash(source),
            state: "PENDING",
            source,
            deadline: deadline(),
            renderer: provenance,
            executionOrigin: "local-worker",
          };
          return exportLease;
        }
        throw new Error(`Unexpected fixture endpoint ${path}`);
      },
      async upload(metadata, bytes) {
        assert.equal(metadata.sourceHash, hash(source));
        artifacts.push({ format: metadata.format, bytes: Buffer.from(bytes) });
        const receipt = {
          exportId: "export",
          projectId: "project",
          revision: "revision",
          sourceHash: hash(source),
          format: metadata.format,
          mimeType: metadata.format === "stl" ? "model/stl" : "model/3mf",
          filename: `model.${metadata.format}`,
          hash: hash(bytes),
          byteSize: bytes.length,
          expiresAt: deadline(),
          downloadUrl: "https://fixture.invalid/download",
          downloadExpiresAt: deadline(),
        };
        const {
          source: _source,
          token: _token,
          renderer: _renderer,
          ...binding
        } = exportLease;
        void _source;
        void _token;
        void _renderer;
        return {
          ...binding,
          state: "COMPLETED",
          receipt,
          artifactAvailable: true,
        };
      },
    },
  };
}
