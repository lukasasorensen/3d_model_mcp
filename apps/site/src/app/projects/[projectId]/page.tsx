import { projectIdSchema } from "@rjls/contracts";
import { ModelWorkspace } from "@/components/ModelWorkspace";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser, withConfiguredCadRuntime } from "@rjls/runtime";
import { headers } from "next/headers";
import { isCadDomainError } from "@/lib/cad-errors";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const projectId = projectIdSchema.safeParse((await params).projectId);
  if (!projectId.success) notFound();
  const user = await getAuthenticatedUser(await headers());
  if (!user) redirect("/sign-in");
  try { await withConfiguredCadRuntime(user.id, (runtime) => runtime.repository.getProjectState(projectId.data)); }
  catch (error) { if (isCadDomainError(error, "PROJECT_NOT_FOUND")) notFound(); throw error; }

  const localMcpBridge = process.env.NODE_ENV !== "production" && process.env.RJLS_LOCAL_MCP_BRIDGE === "1";
  return <ModelWorkspace key={projectId.data} projectId={projectId.data} localMcpBridgeEnabled={localMcpBridge} />;
}
