export interface ModelExportOperations {
  generate(
    ownerId: string,
    input: {
      projectId: string;
      revision: string;
      format: "stl" | "3mf";
      signal?: AbortSignal;
    },
    mode: string,
    origin: string,
  ): Promise<{
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
    downloadUrl: string;
    downloadExpiresAt: string;
  }>;
  complete(
    ownerId: string,
    projectId: string,
    id: string,
    sessionId: string,
    token: string,
    sourceHash: string,
    bytes: Uint8Array,
  ): Promise<void>;
  fail(
    ownerId: string,
    projectId: string,
    id: string,
    sessionId: string,
    token: string,
    sourceHash: string,
  ): Promise<void>;
  download(
    id: string,
    token: string,
  ): Promise<{
    metadata: {
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
    };
    bytes: Uint8Array<ArrayBufferLike>;
  }>;
  cleanup(): Promise<void>;
}
