import * as z from "zod/v4";
import type {
  LocalInstallation,
  LocalRelease,
  LocalSecrets,
} from "../../../domains/local-instance/index.js";
const image = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._/@:-]+$/)
  .refine(
    (value) =>
      !value.endsWith(":latest") &&
      (value.includes(":") || value.includes("@sha256:")),
  );
export const localReleaseSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    workerVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
    postgresMajor: z.literal(18),
    appImage: image,
    toolingImage: image,
    postgresImage: image.optional(),
  })
  .strict();
export const localInstallationSchema = z
  .object({
    format: z.literal(1),
    id: z.string().regex(/^[a-f0-9]{16}$/),
    port: z.number().int().min(1024).max(65535),
    release: localReleaseSchema,
    localImages: z
      .object({ appImage: image, toolingImage: image })
      .strict()
      .optional(),
    upgradePending: z.boolean().optional(),
    journalInitialized: z.boolean().optional(),
  })
  .strict();
export const localSecretsSchema = z
  .object({
    database: z.string().regex(/^[a-f0-9]{64}$/),
    auth: z.string().regex(/^[a-f0-9]{64}$/),
    setup: z.string().regex(/^[a-f0-9]{64}$/),
    ai: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
  })
  .strict();
export function localOrigin(state: LocalInstallation): string {
  return `http://127.0.0.1:${state.port}`;
}
export function localProject(state: LocalInstallation): string {
  return `theoryfoundry-local-${state.id}`;
}
export function localImages(state: LocalInstallation): {
  appImage: string;
  toolingImage: string;
  postgresImage: string;
} {
  return {
    appImage: state.localImages?.appImage ?? state.release.appImage,
    toolingImage: state.localImages?.toolingImage ?? state.release.toolingImage,
    postgresImage: state.release.postgresImage ?? "postgres:18.6-bookworm",
  };
}
export function localEnvironment(
  state: LocalInstallation,
  secrets: LocalSecrets,
): NodeJS.ProcessEnv {
  return {
    TF_LOCAL_INSTANCE_ID: state.id,
    TF_LOCAL_PORT: String(state.port),
    TF_LOCAL_DATABASE_PASSWORD: secrets.database,
    TF_LOCAL_AUTH_SECRET: secrets.auth,
    TF_LOCAL_SETUP_TOKEN: secrets.setup,
    TF_LOCAL_AI_KEYS: JSON.stringify({ local: secrets.ai }),
    TF_LOCAL_APP_IMAGE: localImages(state).appImage,
    TF_LOCAL_TOOLING_IMAGE: localImages(state).toolingImage,
    TF_LOCAL_POSTGRES_IMAGE: localImages(state).postgresImage,
  };
}
export function requireCompatible(
  release: LocalRelease,
  workerVersion: string,
): void {
  if (release.workerVersion !== workerVersion)
    throw new Error(
      "WORKER_VERSION: Use the worker version pinned by this local release.",
    );
}
