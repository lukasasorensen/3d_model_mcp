export function localMcpBridgeEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    environment.NODE_ENV !== "production" &&
    environment.THEORYFOUNDRY_LOCAL_MCP_BRIDGE === "1"
  );
}
