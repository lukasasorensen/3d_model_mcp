import type { CadMcpClient } from "@theoryfoundry/gateway";
export interface ConnectedCadMcpClient extends CadMcpClient {
  readonly processId?: number;
  close(): Promise<void>;
}
