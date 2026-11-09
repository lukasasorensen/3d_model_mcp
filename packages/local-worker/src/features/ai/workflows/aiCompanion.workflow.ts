import { setTimeout as delay } from "node:timers/promises";
import * as z from "zod/v4";
import {
  AI_LIMITS,
  companionJobSchema,
  companionJobResultSchema,
  safeAiError,
} from "@theoryfoundry/contracts";
import type { CompanionApi, LocalAiModels } from "../../../domains/ai/index.js";

export async function serveAiCompanion(
  device: { id: string; name: string; provider: string },
  api: CompanionApi,
  models: LocalAiModels,
  signal: AbortSignal,
  report: (message: string) => void,
): Promise<void> {
  await api.send("register", device, signal);
  report("AI companion connected. Keep this process running while chatting.\n");
  while (!signal.aborted) {
    try {
      const result = z
        .object({ job: companionJobSchema.nullable() })
        .parse(await api.send("claim", { companionId: device.id }, signal));
      const job = result.job;
      if (!job) continue;
      const abort = new AbortController();
      const active = AbortSignal.any([
        signal,
        abort.signal,
        AbortSignal.timeout(Math.max(1, Date.parse(job.deadline) - Date.now())),
      ]);
      const lease = { companionId: device.id, jobId: job.id, lease: job.lease };
      const heartbeat = (async (): Promise<void> => {
        try {
          while (!active.aborted) {
            await delay(AI_LIMITS.heartbeatMs, undefined, { signal: active });
            const response = z
              .object({ active: z.boolean() })
              .parse(await api.send("heartbeat", lease, active));
            if (!response.active) {
              abort.abort();
              return;
            }
          }
        } catch {
          abort.abort();
        }
      })();
      try {
        const output = companionJobResultSchema.parse(
          await models.execute(job.input, active),
        );
        active.throwIfAborted();
        // Retrying completion is safe; never replay model inference automatically.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await api.send("complete", { ...lease, output }, active);
            break;
          } catch (error) {
            if (attempt || active.aborted) throw error;
            await delay(500, undefined, { signal: active });
          }
        }
      } finally {
        abort.abort();
        await heartbeat;
      }
    } catch (error) {
      if (signal.aborted) break;
      report(`${safeAiError(error).message}\n`);
      await delay(2000, undefined, { signal }).catch(() => undefined);
    }
  }
}
