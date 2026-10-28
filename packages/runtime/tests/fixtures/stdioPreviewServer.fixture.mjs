// Protocol fixture: verifies binary content survives the real stdio transport.
import { connectCadMcpStdio } from "@theoryfoundry/mcp";
import { pngFixture } from "./previewPng.fixture.mjs";
const server = await connectCadMcpStdio(
  {},
  {
    previewService: {
      async getPreview(input) {
        return {
          metadata: {
            projectId: input.projectId,
            revisionId: "revision",
            sourceHash: "a".repeat(64),
            imageHash: "b".repeat(64),
            width: 768,
            height: 768,
            view: input.view,
          },
          png: pngFixture(),
        };
      },
    },
  },
);
process.stdin.once("end", () => {
  void server.close();
});
