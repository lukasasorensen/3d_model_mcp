"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ProjectSummary } from "@rjls/contracts";
import { authClient } from "@/lib/auth-client";

export function ProjectLanding({ projects, userName, remoteMcpEnabled = false }: { projects: ProjectSummary[]; userName: string; remoteMcpEnabled?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/v1/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: title.trim(), description: description.trim() }) });
      const body = await response.json() as { project?: { projectId?: string } };
      if (!response.ok || !body.project?.projectId) throw new Error("create failed");
      router.push(`/projects/${encodeURIComponent(body.project.projectId)}`);
    } catch { setError("The project could not be created."); setPending(false); }
  }
  async function signOut() { await authClient.signOut(); router.replace("/sign-in"); router.refresh(); }
  return (
    <main className="project-landing">
      <header><div><p className="eyebrow">RJLS Conversational CAD</p><h1>Your projects</h1><p>Signed in as {userName}</p></div><button type="button" onClick={signOut}>Sign out</button></header>
      {remoteMcpEnabled && <p><a href="/settings/connected-apps">Connected Apps</a></p>}
      <section aria-labelledby="project-list-title">
        <div className="project-list-heading"><h2 id="project-list-title">Projects</h2><button type="button" onClick={() => setIsCreating((value) => !value)} disabled={pending}>{isCreating ? "Cancel" : "New project"}</button></div>
        {isCreating && <form className="project-form" onSubmit={createProject}>
          <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} autoFocus /></label>
          <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={4000} rows={3} /></label>
          <button type="submit" disabled={pending}>{pending ? "Creating…" : "Create project"}</button>
        </form>}
        {error ? <p role="alert" className="auth-error">{error}</p> : null}
        {projects.length === 0 ? <p>No projects yet. Create one to start a model.</p> : <ul>{projects.map((project) => <li key={project.projectId}><button type="button" onClick={() => router.push(`/projects/${encodeURIComponent(project.projectId)}`)}><span className="project-list-details"><strong>{project.name}</strong><span>{project.description}</span></span><code>{project.projectId}</code></button></li>)}</ul>}
      </section>
    </main>
  );
}
