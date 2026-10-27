import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadWorkspace } from "./workspaceSource.repository.mjs";
import { checkArchitecture } from "./architecture.policy.mjs";
import {
  architectureBaselinePath,
  architectureBootstrapCommit,
} from "./architectureBaseline.policy.mjs";

export async function readPreviousArchitectureBaseline(root, ref) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  const revision = git("rev-parse", "--verify", `${ref}^{commit}`).trim();
  const paths = git("ls-tree", "-r", "--name-only", revision).split("\n");
  if (paths.includes(architectureBaselinePath))
    return JSON.parse(git("show", `${revision}:${architectureBaselinePath}`));
  if (revision !== architectureBootstrapCommit)
    throw new Error(
      `${ref}: architecture bootstrap requires ${architectureBootstrapCommit}; fetch full history and use the actual PR base.`,
    );
  const snapshot = await mkdtemp(path.join(tmpdir(), "architecture-base-"));
  try {
    const archive = execFileSync("git", ["archive", revision], {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
    });
    execFileSync("tar", ["-xf", "-", "-C", snapshot], { input: archive });
    const projects = loadWorkspace(root).projects.map(
      (project) => project.directory,
    );
    for (const directory of ["", ...projects]) {
      const dependencies = path.join(root, directory, "node_modules");
      if (existsSync(dependencies))
        await symlink(
          dependencies,
          path.join(snapshot, directory, "node_modules"),
          "dir",
        );
    }
    const findings = await checkArchitecture(snapshot, projects);
    return {
      version: 1,
      sourceCommit: architectureBootstrapCommit,
      violations: findings.map((finding) => ({
        ...finding,
        owner: "bootstrap",
        reason: "Verified against unchanged base-commit source.",
      })),
    };
  } finally {
    await rm(snapshot, { recursive: true, force: true });
  }
}
