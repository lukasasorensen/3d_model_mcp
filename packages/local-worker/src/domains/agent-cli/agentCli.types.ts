export interface AgentConnection {
  server: string;
  account: string;
  allowLoopbackHttp: boolean;
}
export interface AgentCommand {
  command: "connect" | "call" | "tools";
  server?: string;
  account?: string;
  allowLoopbackHttp: boolean;
  tool?: string;
  input?: string;
  output?: string;
}
export interface AgentCapabilities {
  home: string;
  entry: string;
  signal: AbortSignal;
  setup(): Promise<void>;
  authenticate(
    server: string,
    allowLoopbackHttp: boolean,
    account?: string,
  ): Promise<string>;
}
