/// <reference lib="webworker" />
import { installOpenScadWorker } from "@theoryfoundry/browser-renderer";
declare const self: DedicatedWorkerGlobalScope;
installOpenScadWorker(self);
