import { getAuthenticatedUser, remoteMcpEnabled, withConfiguredCadRuntime } from "@rjls/runtime";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ProjectLanding } from "@/components/ProjectLanding";

export default async function ProjectsPage() {
  const user = await getAuthenticatedUser(await headers());
  if (!user) redirect("/sign-in");
  const projects = await withConfiguredCadRuntime(user.id, (runtime) => runtime.repository.listProjects());
  return <ProjectLanding projects={projects.map((project) => project.projectId)} userName={user.name} remoteMcpEnabled={remoteMcpEnabled()} />;
}
