export interface WorkerTarget {
  server: string;
  account?: string;
  allowLoopbackHttp: boolean;
}
export interface ClientInstallation {
  client: "codex" | "claude";
  scope: "global" | "project";
  target: WorkerTarget;
}
export interface ConfigurationReceipt {
  path: string;
  changed: boolean;
  backup?: string;
}
export type WorkerCommand =
  | { command: "help" | "version" }
  | { command: "setup"; installation?: ClientInstallation }
  | { command: "login" | "logout" | "serve"; target: WorkerTarget }
  | { command: "doctor"; target?: WorkerTarget; json: boolean };
export interface Diagnostic {
  check: string;
  status: "ok" | "failed" | "skipped";
  message: string;
}
export interface WorkerPackage {
  name: string;
  version: string;
}
