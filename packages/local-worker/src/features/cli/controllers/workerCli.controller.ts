import type { CommandDependencies } from "../../../domains/installation/index.js";
import { LocalWorkerError } from "../../../shared/utils/workerError.util.js";
import { parseWorkerCommand } from "../utils/commandArguments.util.js";
import { runWorkerCommand } from "../workflows/workerCommand.workflow.js";
export async function workerCli(
  args: string[],
  dependencies: CommandDependencies,
  signal: AbortSignal,
): Promise<number> {
  try {
    return await runWorkerCommand(
      parseWorkerCommand(args),
      dependencies,
      signal,
    );
  } catch (error) {
    dependencies.stderr(
      `${error instanceof LocalWorkerError ? `${error.code}: ${error.message}` : "Worker command failed. Use --help."}\n`,
    );
    return 1;
  }
}
