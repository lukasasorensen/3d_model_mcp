import { ModelWorkspace } from "@/components/ModelWorkspace";

export default function Home() {
  const localMcpBridge = process.env.NODE_ENV !== "production" && process.env.RJLS_LOCAL_MCP_BRIDGE === "1";
  return <ModelWorkspace localMcpBridgeEnabled={localMcpBridge} />;
}
