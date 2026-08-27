import { getAuthenticatedUser, getConfiguredCadRuntime } from "@rjls/runtime";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ProjectLanding } from "@/components/ProjectLanding";

export default async function ProjectsPage() {
  const user = await getAuthenticatedUser(await headers()).catch(() => null);
  if (!user) redirect("/sign-in");
  const projects = await (await getConfiguredCadRuntime(user.id)).repository.listProjects();
  return <ProjectLanding projects={projects.map((project) => project.projectId)} userName={user.name} />;
}
