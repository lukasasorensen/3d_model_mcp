export interface LocalRelease {
  version: string;
  workerVersion: string;
  postgresMajor: 18;
  appImage: string;
  toolingImage: string;
  postgresImage?: string | undefined;
}
export interface LocalImages {
  appImage: string;
  toolingImage: string;
}
export interface LocalInstallation {
  format: 1;
  id: string;
  port: number;
  release: LocalRelease;
  localImages?: LocalImages | undefined;
  upgradePending?: boolean | undefined;
  journalInitialized?: boolean | undefined;
}
export interface LocalSecrets {
  database: string;
  auth: string;
  setup: string;
  ai: string;
}
export interface ProcessResult {
  stdout: Buffer;
  code: number;
}
export type RunLocalProcess = (
  args: string[],
  options?: {
    environment?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    input?: Buffer;
    limit?: number;
  },
) => Promise<ProcessResult>;
export interface LocalInstanceCapabilities {
  run: RunLocalProcess;
  secrets(id: string, value?: LocalSecrets): Promise<LocalSecrets | undefined>;
  prompt(message: string): Promise<string>;
  open(url: string): Promise<void>;
  signal: AbortSignal;
  home: string;
  assets: string;
}
export interface LocalCommand {
  command:
    | "start"
    | "status"
    | "stop"
    | "logs"
    | "backup"
    | "restore"
    | "upgrade"
    | "setup";
  source?: string;
  port?: number;
  output?: string;
  input?: string;
  release?: string;
  open: boolean;
}
