"use client";
import type { JSX } from "react";

import type { ProjectSummary } from "@theoryfoundry/contracts";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { authClient } from "../../../authentication/browser/index";

export function ProjectLanding({
  projects,
  userName,
  remoteMcpEnabled = false,
}: {
  projects: ProjectSummary[];
  userName: string;
  remoteMcpEnabled?: boolean;
}): JSX.Element {
  const router = useRouter();
  const createButton = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  async function createProject(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/v1/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: title.trim(),
          description: description.trim(),
        }),
      });
      const body = (await response.json()) as {
        project?: { projectId?: string };
      };
      if (!response.ok || !body.project?.projectId)
        throw new Error("create failed");
      router.push(`/projects/${encodeURIComponent(body.project.projectId)}`);
    } catch {
      setError("The project could not be created.");
      setPending(false);
    }
  }
  async function signOut(): Promise<void> {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }
  return (
    <main className="project-landing">
      <header>
        <div>
          <p className="project-brand">TheoryFoundry</p>
          <h1 id="project-list-title">Your projects</h1>
          <p className="project-account">Signed in as {userName}</p>
        </div>
        <nav className="project-account-actions" aria-label="Account">
          {remoteMcpEnabled && (
            <a href="/settings/connected-apps">Connected apps</a>
          )}
          <button
            type="button"
            onClick={() => {
              void signOut();
            }}
          >
            Sign out
          </button>
        </nav>
      </header>
      <section aria-labelledby="project-list-title">
        <div className="project-list-heading">
          <p className="project-count">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </p>
          <button
            type="button"
            ref={createButton}
            className="button-primary"
            aria-expanded={isCreating}
            aria-controls="new-project-form"
            onClick={() => {
              setError("");
              setIsCreating((value) => !value);
            }}
            disabled={pending}
          >
            {isCreating ? "Close form" : "New project"}
          </button>
        </div>
        {isCreating && (
          <form
            id="new-project-form"
            aria-labelledby="new-project-title"
            className="project-form"
            onSubmit={(event) => {
              void createProject(event);
            }}
          >
            <h2 id="new-project-title">Create a project</h2>
            <label>
              Project name
              <input
                disabled={pending}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={200}
                autoFocus
              />
            </label>
            <label>
              Description
              <textarea
                disabled={pending}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
                maxLength={4000}
                rows={3}
              />
            </label>
            <div className="project-form-actions">
              <button
                type="submit"
                className="button-primary"
                disabled={pending}
              >
                {pending ? "Creating…" : "Create project"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setIsCreating(false);
                  setError("");
                  createButton.current?.focus();
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {error ? (
          <p role="alert" className="auth-error">
            {error}
          </p>
        ) : null}
        {projects.length === 0 ? (
          <div className="projects-empty">
            <h2>Start your first model</h2>
            <p>
              Create a project to keep its model and revision history together.
            </p>
          </div>
        ) : (
          <ul>
            {projects.map((project) => (
              <li key={project.projectId}>
                <a
                  className="project-open"
                  href={`/projects/${encodeURIComponent(project.projectId)}`}
                >
                  <strong>{project.name}</strong>
                  <span aria-hidden="true">Open →</span>
                </a>
                <details className="project-details">
                  <summary>
                    Project details
                    <span className="sr-only"> for {project.name}</span>
                  </summary>
                  <p>{project.description}</p>
                  <dl>
                    <dt>Project ID</dt>
                    <dd>
                      <code>{project.projectId}</code>
                    </dd>
                  </dl>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
