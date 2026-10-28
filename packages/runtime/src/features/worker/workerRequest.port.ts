export interface WorkerRequestPolicy {
  authenticate: (request: Request) => Promise<string>;
  enabled: () => boolean;
  origin: () => string;
}

/** Shared admission and bounded JSON handling for authenticated worker operations. */
export interface WorkerOperation<Input, Output> {
  schema: {
    safeParse: (
      raw: unknown,
    ) => { success: true; data: Input } | { success: false };
  };
  execute: (ownerId: string, input: Input) => Promise<Output>;
  unavailableCode: string;
}
