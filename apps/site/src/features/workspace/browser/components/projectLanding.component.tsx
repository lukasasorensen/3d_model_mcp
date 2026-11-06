"use client";
import { ProjectList } from "./projectList.component";
import type { JSX } from "react";

import type { ProjectSummary } from "@theoryfoundry/contracts";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { authClient } from "../../../authentication/browser/index";

export function ProjectLanding({
  projects,
  archivedProjects,
  userName,
  remoteMcpEnabled = false,
  canInvite = false,
}: {
  projects: ProjectSummary[];
  archivedProjects?: ProjectSummary[];
  userName: string;
  remoteMcpEnabled?: boolean;
  canInvite?: boolean;
}): JSX.Element {
  const router = useRouter();
  const createButton = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const busy = pending || signOutPending;
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  async function createProject(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (busy) return;
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
    if (busy) return;
    setSignOutPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("sign-out failed");
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("Sign-out is temporarily unavailable. Please try again.");
    } finally {
      setSignOutPending(false);
    }
  }
  return (
    <main className="project-landing">
      <header>
        <div>
          <p className="project-brand">TheoryFoundry</p>
          <h1 id="project-list-title" tabIndex={-1}>
            Your projects
          </h1>
          <p className="project-account">Signed in as {userName}</p>
        </div>
        <nav className="project-account-actions" aria-label="Account">
          <a href="/settings/account">Account settings</a>
          <a href="/settings/ai-connections">AI connections</a>
          {canInvite && <a href="/admin/invitations">Invitations</a>}
          {remoteMcpEnabled && (
            <a href="/settings/connected-apps">Connected apps</a>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void signOut();
            }}
          >
            {signOutPending ? "Signing out…" : "Sign out"}
          </button>
        </nav>
      </header>
      <section aria-labelledby="project-list-title">
        <div className="project-list-heading">
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
            disabled={busy}
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
                disabled={busy}
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
                disabled={busy}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
                maxLength={4000}
                rows={3}
              />
            </label>
            <div className="project-form-actions">
              <button type="submit" className="button-primary" disabled={busy}>
                {pending ? "Creating…" : "Create project"}
              </button>
              <button
                type="button"
                disabled={busy}
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
        <ProjectList
          active={projects}
          archived={archivedProjects}
          busy={busy}
        />
      </section>
    </main>
  );
}
