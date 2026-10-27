import assert from "node:assert/strict";
import { getEventListeners, once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { CadDomainError, ModelProjectRepository } from "../../../dist/index.js";
import {
  acceptRendererProvenance,
  promoteCrashInChild,
  promotePausedInChild,
  renderer,
  validCandidate,
  withWorkspace,
} from "../../fixtures/fileProject.fixture.mjs";
test("recovers an abandoned cross-process promotion lock", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance,
      lockStaleMs: 0,
    });
    const candidate = await validCandidate(
      repository,
      "demo",
      null,
      "cube(1);",
    );
    const lock = join(
      workspaceRoot,
      "demo",
      ".theoryfoundry",
      "locks",
      "promotion.lock",
    );
    await mkdir(lock);
    await writeFile(
      join(lock, "owner.json"),
      JSON.stringify({
        pid: 999_999_999,
        token: "00000000-0000-4000-8000-000000000000",
        acquiredAt: new Date(0).toISOString(),
      }),
    );
    const revision = await repository.promoteCandidate({
      projectId: "demo",
      candidateId: candidate.candidateId,
      expectedParentRevision: null,
    });
    assert.equal(
      (await repository.getProjectState("demo")).currentRevision,
      revision.revisionId,
    );
  });
});
test("lock contention polling releases abort listeners after normal delay settlement", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance,
      lockTimeoutMs: 60,
    });
    const candidate = await validCandidate(
      repository,
      "demo",
      null,
      "cube(1);",
    );
    const lock = join(
      workspaceRoot,
      "demo",
      ".theoryfoundry",
      "locks",
      "promotion.lock",
    );
    await mkdir(lock);
    await writeFile(join(lock, "owner.json"), "{malformed");
    const controller = new AbortController();
    await assert.rejects(
      repository.promoteCandidate({
        projectId: "demo",
        candidateId: candidate.candidateId,
        expectedParentRevision: null,
        signal: controller.signal,
      }),
      (error) =>
        error instanceof CadDomainError && error.code === "LOCK_TIMEOUT",
    );
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  });
});
test("malformed owner metadata cannot steal a live cross-process promotion lock", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance,
    });
    const left = await validCandidate(repository, "demo", null, "cube(1);");
    const right = await validCandidate(repository, "demo", null, "sphere(1);");
    const child = promotePausedInChild(workspaceRoot, left.candidateId);
    const [locked] = await once(child, "message");
    assert.equal(locked.stage, "locked");
    await writeFile(
      join(
        workspaceRoot,
        "demo",
        ".theoryfoundry",
        "locks",
        "promotion.lock",
        "owner.json",
      ),
      "{malformed",
    );
    const contender = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance,
      lockTimeoutMs: 100,
      lockStaleMs: 0,
    });
    await assert.rejects(
      contender.promoteCandidate({
        projectId: "demo",
        candidateId: right.candidateId,
        expectedParentRevision: null,
      }),
      (error) =>
        error instanceof CadDomainError && error.code === "LOCK_TIMEOUT",
    );
    const resultPromise = once(child, "message");
    child.send("resume");
    const [result] = await resultPromise;
    assert.equal(result.ok, true);
    assert.equal((await repository.listRevisions("demo")).length, 1);
  });
});
test("process death after CURRENT rename reopens authoritatively and reconciles candidate audit state", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance,
    });
    const candidate = await validCandidate(
      repository,
      "demo",
      null,
      "cube(1);",
    );
    const child = promoteCrashInChild(
      workspaceRoot,
      candidate.candidateId,
      "current-renamed",
    );
    const [exitCode] = await once(child, "exit");
    assert.equal(exitCode, 86);
    const reopened = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance,
      lockStaleMs: 0,
    });
    const recovered = await reopened.getProjectState("demo");
    assert.ok(recovered.currentRevision);
    const persisted = JSON.parse(
      await readFile(
        join(
          workspaceRoot,
          "demo",
          ".theoryfoundry",
          "candidates",
          candidate.candidateId,
          "candidate.json",
        ),
        "utf8",
      ),
    );
    assert.equal(persisted.state, "PROMOTED");
    const nextCandidate = await validCandidate(
      reopened,
      "demo",
      recovered.currentRevision,
      "cube(2);",
    );
    const nextRevision = await reopened.promoteCandidate({
      projectId: "demo",
      candidateId: nextCandidate.candidateId,
      expectedParentRevision: recovered.currentRevision,
    });
    assert.equal(nextRevision.parentRevision, recovered.currentRevision);
  });
});
