import * as z from "zod/v4";
import {
  modelFilesSchema,
  opaqueIdSchema,
  revisionIdSchema,
} from "@theoryfoundry/contracts";
import { WORKING_MODEL_REQUEST_BYTES } from "../../workingModel.schema";
import type { StoredWorkingDraft } from "../workingDraft.types";

const ENTRY_CHARACTERS = 2 * WORKING_MODEL_REQUEST_BYTES;
const storedDraftSchema = z.strictObject({
  version: z.literal(1),
  parentRevision: revisionIdSchema,
  requestId: opaqueIdSchema.optional(),
  fields: z.strictObject({
    parameters: z.record(
      z.string(),
      z.union([z.string().max(4096), z.boolean()]),
    ),
    modelFiles: modelFilesSchema.optional(),
    rename: z
      .strictObject({ id: opaqueIdSchema, value: z.string().max(100) })
      .optional(),
    numeric: z.record(
      z.string(),
      z.strictObject({
        values: z.array(z.string().max(128)).length(3),
        uniform: z.string().max(128),
        error: z.string().max(500),
      }),
    ),
  }),
});

export function workingDraftKey(ownerId: string, projectId: string): string {
  return "theoryfoundry-working-model:" + JSON.stringify([ownerId, projectId]);
}

export function readWorkingDraft(key: string): StoredWorkingDraft | undefined {
  const raw = sessionStorage.getItem(key);
  if (!raw || raw.length > ENTRY_CHARACTERS) return undefined;
  try {
    const parsed = storedDraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function writeWorkingDraft(
  key: string,
  draft: StoredWorkingDraft | undefined,
): boolean {
  try {
    if (!draft) sessionStorage.removeItem(key);
    else {
      const raw = JSON.stringify(draft);
      if (
        raw.length > ENTRY_CHARACTERS ||
        !storedDraftSchema.safeParse(draft).success
      )
        return false;
      sessionStorage.setItem(key, raw);
    }
    return true;
  } catch {
    return false;
  }
}
