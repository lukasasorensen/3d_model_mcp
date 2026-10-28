import type { JSX } from "react";
import {
  getAuthenticatedUser,
  remoteMcpEnabled,
  withConfiguredCadRuntime,
} from "@theoryfoundry/runtime";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ProjectLanding } from "../../features/workspace/browser/index";

export default async function ProjectsPage(): Promise<JSX.Element> {
  const user = await getAuthenticatedUser(await headers());
  if (!user) redirect("/sign-in");
  const projects = await withConfiguredCadRuntime(user.id, (runtime) =>
    runtime.repository.listProjects(),
  );
  return (
    <ProjectLanding
      projects={projects}
      userName={user.name}
      remoteMcpEnabled={remoteMcpEnabled()}
    />
  );
}
