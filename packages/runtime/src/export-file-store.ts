import { mkdir, writeFile, rename, readFile, rm, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
export interface ExportFileStore {
    put(id: string, bytes: Uint8Array): Promise<void>;
    read(id: string): Promise<Uint8Array>;
    remove(id: string): Promise<void>;
    reconcile(retained: Set<string>): Promise<void>;
}
export class DirectoryExportFileStore implements ExportFileStore {
    readonly directory: string;
    constructor(directory: string) { this.directory = resolve(directory); }
    private path(id: string) { if (!/^[a-f0-9-]{36}$/.test(id))
        throw new Error("Invalid export storage key."); return join(this.directory, id); }
    async put(id: string, bytes: Uint8Array) {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const target = this.path(id), temporary = `${target}.${randomUUID()}.tmp`;
        try {
            await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
            await rename(temporary, target);
        }
        finally {
            await rm(temporary, { force: true });
        }
    }
    async read(id: string) { return readFile(this.path(id)); }
    async remove(id: string) { await rm(this.path(id), { force: true }); }
    async reconcile(retained: Set<string>) {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        for (const name of await readdir(this.directory)) {
            if (!/^[a-f0-9-]{36}(\.[a-f0-9-]{36}\.tmp)?$/.test(name) || retained.has(name))
                continue;
            const path = join(this.directory, name);
            if (Date.now() - (await stat(path)).mtimeMs > 120000)
                await rm(path, { force: true });
        }
    }
}
