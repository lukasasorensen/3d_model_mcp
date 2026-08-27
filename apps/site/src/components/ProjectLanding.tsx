"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function ProjectLanding({ projects, userName }: { projects: string[]; userName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function createProject() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/v1/projects", { method: "POST" });
      const body = await response.json() as { project?: { projectId?: string } };
      if (!response.ok || !body.project?.projectId) throw new Error("create failed");
      router.push(`/projects/${encodeURIComponent(body.project.projectId)}`);
    } catch { setError("The project could not be created."); setPending(false); }
  }
  async function signOut() { await authClient.signOut(); router.replace("/sign-in"); router.refresh(); }
  return (
    <main className="project-landing">
      <header><div><p className="eyebrow">RJLS Conversational CAD</p><h1>Your projects</h1><p>Signed in as {userName}</p></div><button type="button" onClick={signOut}>Sign out</button></header>
      <section aria-labelledby="project-list-title">
        <div className="project-list-heading"><h2 id="project-list-title">Projects</h2><button type="button" onClick={createProject} disabled={pending}>{pending ? "Creating…" : "New project"}</button></div>
        {error ? <p role="alert" className="auth-error">{error}</p> : null}
        {projects.length === 0 ? <p>No projects yet. Create one to start a model.</p> : <ul>{projects.map((project) => <li key={project}><button type="button" onClick={() => router.push(`/projects/${encodeURIComponent(project)}`)}><span>Open project</span><code>{project}</code></button></li>)}</ul>}
      </section>
    </main>
  );
}
