import assert from "node:assert/strict";
import test from "node:test";
import {
  BrowserPresenceRepository,
  PostgresModelProjectRepository,
  createProjectDatabase,
} from "@theoryfoundry/model-project";
import { isBrowserRendererProvenance } from "@theoryfoundry/contracts";
import {
  LocalBrowserRenderer,
  createStdioCadMcpClient,
  expectedBrowserProvenance,
} from "../dist/index.js";
test(
  "standalone PostgreSQL stdio server validates in an open-browser peer and promotes",
  {
    skip:
      !process.env.THEORYFOUNDRY_TEST_DATABASE_URL ||
      !process.env.THEORYFOUNDRY_TEST_ACTOR_USER_ID,
  },
  async () => {
    const projectId = `stdio-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const database = createProjectDatabase(
      process.env.THEORYFOUNDRY_TEST_DATABASE_URL,
    );
    const repository = new PostgresModelProjectRepository({
      pool: database.pool,
      ownerId: process.env.THEORYFOUNDRY_TEST_ACTOR_USER_ID,
      renderer: {
        async validateAndRender() {
          throw new Error("unused");
        },
      },
      acceptRendererProvenance: isBrowserRendererProvenance,
      createId: () => projectId,
    });
    await repository.createProject({
      name: "Test project",
      description: "Test model",
    });
    const executable = new URL("../dist/stdio-server.js", import.meta.url);
    const client = await createStdioCadMcpClient({
      command: process.execPath,
      args: [executable.pathname],
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: process.env.THEORYFOUNDRY_TEST_DATABASE_URL,
        THEORYFOUNDRY_ACTOR_USER_ID:
          process.env.THEORYFOUNDRY_TEST_ACTOR_USER_ID,
      },
      stderr: "pipe",
    });
    const browser = new LocalBrowserRenderer(
      database,
      process.env.THEORYFOUNDRY_TEST_ACTOR_USER_ID,
      "cad-validation-v1",
    );
    try {
      await new BrowserPresenceRepository(
        database.pool,
        process.env.THEORYFOUNDRY_TEST_ACTOR_USER_ID,
      ).update(projectId, {
        sessionId: "browser-session",
        tabId: "stdio-test-tab",
        visible: true,
        ready: true,
        busy: false,
        localEnabled: true,
        remoteEnabled: false,
      });
      const proposed = await client.callTool(
        "propose_model_source",
        {
          projectId,
          parentRevision: null,
          source: "cube([10,10,10]);",
          requestId: "stdio-live-request",
          toolCallId: "stdio-live-propose",
        },
        {},
      );
      const candidateId = proposed.structuredContent.candidate.candidateId;
      const pending = client.callTool(
        "validate_and_render",
        {
          projectId,
          candidateId,
          previewProfile: "standard",
        },
        {},
      );
      let job;
      for (let attempt = 0; attempt < 40 && !job; attempt += 1) {
        job = await browser.claimNext(projectId, "browser-session");
        if (!job) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.ok(job);
      await browser.complete(job.jobId, {
        token: job.token,
        sessionId: "browser-session",
        sourceHash: job.sourceHash,
        outcome: "VALID",
        diagnostics: [],
        provenance: expectedBrowserProvenance("cad-validation-v1"),
      });
      const validated = await pending;
      assert.equal(validated.structuredContent.candidate.state, "VALID");
      const promoted = await client.callTool(
        "promote_candidate",
        {
          projectId,
          candidateId,
          expectedParentRevision: null,
        },
        {},
      );
      assert.equal(promoted.isError, false);
      const state = await client.callTool(
        "get_project_state",
        { projectId },
        {},
      );
      assert.equal(
        state.structuredContent.state.currentRevision,
        promoted.structuredContent.revision.revisionId,
      );
    } finally {
      await client.close();
      await database.close();
    }
  },
);
