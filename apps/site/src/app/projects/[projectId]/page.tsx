import { projectIdSchema } from "@theoryfoundry/contracts";
import { BrowserWorkspace } from "@/workspace.composition";
import { notFound, redirect } from "next/navigation";
import {
  getAuthenticatedUser,
  remoteMcpEnabled,
  remoteMcpIdentity,
  withConfiguredCadRuntime,
} from "@theoryfoundry/runtime";
import { headers } from "next/headers";
import { isCadDomainError } from "../../../shared/errors/cadErrors.util";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const projectId = projectIdSchema.safeParse((await params).projectId);
  if (!projectId.success) notFound();
  const user = await getAuthenticatedUser(await headers());
  if (!user) redirect("/sign-in");
  try {
    await withConfiguredCadRuntime(user.id, (runtime) =>
      runtime.repository.getProjectState(projectId.data),
    );
  } catch (error) {
    if (isCadDomainError(error, "PROJECT_NOT_FOUND")) notFound();
    throw error;
  }

  const localMcpBridge =
    process.env.NODE_ENV !== "production" &&
    process.env.THEORYFOUNDRY_LOCAL_MCP_BRIDGE === "1";
  return (
    <BrowserWorkspace
      key={projectId.data}
      projectId={projectId.data}
      localMcpBridgeEnabled={localMcpBridge}
      remoteMcpEnabled={remoteMcpEnabled()}
      codexOrigin={remoteMcpEnabled() ? remoteMcpIdentity().origin : undefined}
    />
  );
}
