import { createHash } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ErasureReceipt, ErasureTarget } from "../erasure.types.js";
import { writeAtomic } from "../utils/durableFiles.util.js";

const receiptSchema = z.strictObject({
  ownerId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  exportIds: z.array(z.uuid()),
  invitationIds: z.array(z.string().min(1)),
});
function filename(target: ErasureTarget): string {
  return (
    createHash("sha256")
      .update(JSON.stringify([target.ownerId, target.projectId]))
      .digest("hex") + ".json"
  );
}
export class ErasureJournal {
  constructor(
    private readonly directory: string,
    private readonly managed: boolean,
  ) {}

  async check(): Promise<void> {
    if (this.managed) {
      if (
        (await readFile(join(this.directory, "JOURNAL"), "utf8")).trim() !==
        "theoryfoundry-erasure-v1"
      )
        throw new Error("Invalid erasure journal.");
    } else await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }
  private async read(name: string): Promise<ErasureReceipt> {
    const receipt = receiptSchema.parse(
      JSON.parse(await readFile(join(this.directory, name), "utf8")),
    );
    if (filename(receipt) !== name)
      throw new Error("Mismatched erasure journal record.");
    return receipt;
  }
  async find(target: ErasureTarget): Promise<ErasureReceipt | undefined> {
    await this.check();
    try {
      return await this.read(filename(target));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  async save(receipt: ErasureReceipt): Promise<void> {
    await writeAtomic(
      join(this.directory, filename(receipt)),
      JSON.stringify(receiptSchema.parse(receipt)),
    );
  }
  async *records(): AsyncGenerator<ErasureReceipt> {
    await this.check();
    for (const name of await readdir(this.directory)) {
      if (
        name === "JOURNAL" ||
        /^\.[a-f0-9]{64}\.json\.[a-f0-9-]{36}\.tmp$/.test(name)
      )
        continue;
      if (!/^[a-f0-9]{64}\.json$/.test(name))
        throw new Error("Unexpected erasure journal entry.");
      yield await this.read(name);
    }
  }
}
