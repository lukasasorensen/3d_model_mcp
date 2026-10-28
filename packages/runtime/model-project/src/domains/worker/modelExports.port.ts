import { type ExportReceipt } from "@theoryfoundry/contracts";
import type { ExportRow } from "./export.types.js";
export interface ModelExportsStore {
  list(projectId: string): Promise<
    {
      exportId: string;
      projectId: string;
      revision: string;
      sourceHash: string;
      format: "stl" | "3mf";
      mimeType: "model/stl" | "model/3mf";
      filename: string;
      hash: string;
      byteSize: number;
      expiresAt: string;
    }[]
  >;
  accept(
    projectId: string,
    revision: string,
    format: "stl" | "3mf",
    mode: string,
  ): Promise<ExportRow>;
  get(id: string): Promise<ExportRow>;
  claim(
    projectId: string,
    sessionId: string,
    modes: string[],
  ): Promise<
    | {
        jobId: string;
        projectId: string;
        revision: string;
        source: string;
        sourceHash: string;
        format: "stl" | "3mf";
        token: string;
        deadline: string;
      }
    | undefined
  >;
  receipt(row: ExportRow, origin: string): Promise<ExportReceipt>;
}
