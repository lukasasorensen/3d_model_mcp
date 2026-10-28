export interface ExportFileStore {
  put(id: string, bytes: Uint8Array): Promise<void>;
  read(id: string): Promise<Uint8Array>;
  remove(id: string): Promise<void>;
  reconcile(retained: Set<string>): Promise<void>;
}
