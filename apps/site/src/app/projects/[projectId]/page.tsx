import { projectIdSchema } from "@rjls/contracts";
import { ModelWorkspace } from "@/components/ModelWorkspace";
import { notFound } from "next/navigation";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const projectId = projectIdSchema.safeParse((await params).projectId);
  if (!projectId.success) notFound();

  const localMcpBridge = process.env.NODE_ENV !== "production" && process.env.RJLS_LOCAL_MCP_BRIDGE === "1";
  return <ModelWorkspace key={projectId.data} projectId={projectId.data} localMcpBridgeEnabled={localMcpBridge} />;
}
