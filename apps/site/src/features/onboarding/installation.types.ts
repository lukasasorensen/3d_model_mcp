export type HostedClient = "codex" | "claude";
export interface HostedInstallations {
  origin?: string;
  codex?: string;
  claude?: string;
  npmAvailable?: boolean;
}
