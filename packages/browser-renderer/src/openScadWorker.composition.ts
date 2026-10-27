import { registerOpenScadWorker } from "./features/rendering/index.js";
import type { OpenScadWorkerScope } from "./features/rendering/index.js";
export function installOpenScadWorker(scope: OpenScadWorkerScope): void {
  registerOpenScadWorker(scope);
}
