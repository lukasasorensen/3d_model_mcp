"use client";

import type { ProjectSummary } from "@theoryfoundry/contracts";
import { useRouter } from "next/navigation";
import { useRef, useState, type JSX } from "react";
import { flushSync } from "react-dom";
import { DeleteProjectDialog } from "./deleteProjectDialog.component";

type View = "active" | "archived";
type Action = "archive" | "unarchive" | "delete";
const empty: ProjectSummary[] = [];

export function ProjectList({
  active,
  archived = empty,
  busy,
}: {
  active: ProjectSummary[];
  archived?: ProjectSummary[] | undefined;
  busy: boolean;
}): JSX.Element {
  const router = useRouter();
  const list = useRef<HTMLUListElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<View>("active");
  const [lists, setLists] = useState({ active, archived });
  const [source, setSource] = useState({ active, archived });
  if (active !== source.active || archived !== source.archived) {
    setSource({ active, archived });
    setLists({ active, archived });
  }
  const [confirm, setConfirm] = useState<ProjectSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const projects = lists[view];
  const disabled = busy || pending;
  async function change(
    project: ProjectSummary,
    action: Action,
  ): Promise<void> {
    if (disabled) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/v1/projects/${encodeURIComponent(project.projectId)}`,
        action === "delete"
          ? { method: "DELETE" }
          : {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ isArchived: action === "archive" }),
            },
      );
      if (!response.ok) throw new Error("Project update failed.");
      const index = projects.findIndex(
        (item) => item.projectId === project.projectId,
      );
      const otherView = view === "active" ? "archived" : "active";
      flushSync(() => {
        setLists((current) => ({
          ...current,
          [view]: current[view].filter(
            (item) => item.projectId !== project.projectId,
          ),
          [otherView]:
            action === "delete"
              ? current[otherView]
              : [...current[otherView], project].sort((a, b) =>
                  a.projectId.localeCompare(b.projectId),
                ),
        }));
        setConfirm(null);
        setMessage(
          `${project.name} ${action === "delete" ? "deleted" : action === "archive" ? "archived" : "unarchived"}.`,
        );
      });
      const next =
        list.current?.querySelectorAll<HTMLAnchorElement>(".project-open")[
          index
        ];
      (next ?? document.getElementById("project-list-title"))?.focus();
      router.refresh();
    } catch {
      setError(`Could not ${action} ${project.name}. Please try again.`);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div className="project-views" role="group" aria-label="Project views">
        {(["active", "archived"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            disabled={disabled}
            onClick={() => {
              setView(option);
              setError("");
              setMessage("");
            }}
          >
            {option === "active" ? "Active" : "Archived"} (
            {lists[option].length})
          </button>
        ))}
      </div>
      <p className="sr-only" role="status">
        {message}
      </p>
      {error && !confirm && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {!projects.length ? (
        <div className="projects-empty">
          <h2>
            {view === "archived"
              ? "No archived projects"
              : lists.archived.length
                ? "No active projects"
                : "Start your first model"}
          </h2>
          <p>
            {view === "archived"
              ? "Projects you archive will appear here. You can still open and edit them."
              : lists.archived.length
                ? "Create a project or unarchive one to see it here."
                : "Create a project to keep its model and revision history together."}
          </p>
        </div>
      ) : (
        <ul ref={list}>
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
              <div className="project-actions">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    void change(
                      project,
                      view === "active" ? "archive" : "unarchive",
                    );
                  }}
                >
                  {view === "active" ? "Archive" : "Unarchive"}
                  <span className="sr-only"> {project.name}</span>
                </button>
                <button
                  type="button"
                  className="project-delete"
                  disabled={disabled}
                  onClick={(event) => {
                    deleteButton.current = event.currentTarget;
                    setError("");
                    setConfirm(project);
                  }}
                >
                  Delete<span className="sr-only"> {project.name}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {confirm && (
        <DeleteProjectDialog
          name={confirm.name}
          pending={pending}
          error={error}
          onCancel={() => {
            flushSync(() => setConfirm(null));
            deleteButton.current?.focus();
            setError("");
          }}
          onDelete={() => {
            void change(confirm, "delete");
          }}
        />
      )}
    </>
  );
}
