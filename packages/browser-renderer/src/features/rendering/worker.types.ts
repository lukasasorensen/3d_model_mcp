export type RenderMessage = {
  source: string;
  format: "stl" | "3mf";
  origin: string;
};
export type OpenScadModule = {
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, value: string | Uint8Array): void;
    readFile(path: string): Uint8Array;
  };
  ENV: Record<string, string>;
  callMain(args: string[]): number;
};

export interface OpenScadWorkerScope {
  onmessage:
    ((event: MessageEvent<RenderMessage>) => void | Promise<void>) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}
