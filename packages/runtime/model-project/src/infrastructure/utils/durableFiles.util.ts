import { randomUUID } from "node:crypto";
import { open, rename, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
export async function fsyncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export async function writeDurable(
  path: string,
  contents: string | Uint8Array,
): Promise<void> {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export async function writeAtomic(
  path: string,
  contents: string | Uint8Array,
): Promise<void> {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`,
  );
  await writeDurable(temporary, contents);
  await rename(temporary, path);
  await fsyncDirectory(dirname(path));
}
export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
