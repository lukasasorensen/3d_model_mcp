export interface WorkerTarget {
  server: string;
  account?: string;
  allowLoopbackHttp: boolean;
}
export type WorkerCommand =
  | { command: "help" | "version" | "setup" }
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
