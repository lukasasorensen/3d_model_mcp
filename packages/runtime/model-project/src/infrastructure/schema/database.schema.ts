import { account } from "./account.schema.js";
import { defineBrowserPresenceSchema } from "./browserPresence.schema.js";
import { defineBrowserPreviewJobsSchema } from "./browserPreviewJob.schema.js";
import { defineBrowserRenderJobsSchema } from "./browserRenderJob.schema.js";
import { defineCandidatesSchema } from "./candidate.schema.js";
import { defineCandidateArtifactsSchema } from "./candidateArtifact.schema.js";
import { candidateState } from "./candidateState.enum.js";
import { defineExportDownloadTokensSchema } from "./exportDownloadToken.schema.js";
import { jwks } from "./jwks.schema.js";
import { defineModelExportsSchema } from "./modelExport.schema.js";
import { oauthAccessToken } from "./oauthAccessToken.schema.js";
import { oauthClient } from "./oauthClient.schema.js";
import { oauthClientAssertion } from "./oauthClientAssertion.schema.js";
import { oauthClientResource } from "./oauthClientResource.schema.js";
import { oauthConsent } from "./oauthConsent.schema.js";
import { oauthRefreshToken } from "./oauthRefreshToken.schema.js";
import { oauthResource } from "./oauthResource.schema.js";
import { defineProjectsSchema } from "./project.schema.js";
import { renderDeliveryMode } from "./renderDeliveryMode.enum.js";
import { renderJobState } from "./renderJobState.enum.js";
import { defineRevisionsSchema } from "./revision.schema.js";
import { defineRevisionArtifactsSchema } from "./revisionArtifact.schema.js";
import { session } from "./session.schema.js";
import { user } from "./user.schema.js";
import { defineValidationAttemptsSchema } from "./validationAttempt.schema.js";
import { verification } from "./verification.schema.js";
import { defineWorkerExportJobsSchema } from "./workerExportJob.schema.js";
import { workerExportState } from "./workerExportState.enum.js";
import { defineWorkerValidationJobsSchema } from "./workerValidationJob.schema.js";
const projects = defineProjectsSchema({ revisions: () => revisions.id });
const revisions = defineRevisionsSchema({ projects: () => projects.id });
const browserPresence = defineBrowserPresenceSchema({
  projects: () => projects.id,
});
const browserPreviewJobs = defineBrowserPreviewJobsSchema({
  projects: () => projects.id,
});
const browserRenderJobs = defineBrowserRenderJobsSchema({
  projects: () => projects.id,
});
const candidates = defineCandidatesSchema({
  projects: () => projects.id,
  revisions: () => revisions.id,
});
const candidateArtifacts = defineCandidateArtifactsSchema({
  candidates: () => candidates.id,
});
const modelExports = defineModelExportsSchema({ projects: () => projects.id });
const revisionArtifacts = defineRevisionArtifactsSchema({
  revisions: () => revisions.id,
});
const validationAttempts = defineValidationAttemptsSchema({
  candidates: () => candidates.id,
});
const workerExportJobs = defineWorkerExportJobsSchema({
  projects: () => projects.id,
});
const workerValidationJobs = defineWorkerValidationJobsSchema({
  candidates: () => candidates.id,
  projects: () => projects.id,
  validationAttempts: () => validationAttempts.id,
});
const exportDownloadTokens = defineExportDownloadTokensSchema({
  modelExports: () => modelExports.id,
});
export {
  account,
  browserPresence,
  browserPreviewJobs,
  browserRenderJobs,
  candidateArtifacts,
  candidates,
  candidateState,
  exportDownloadTokens,
  jwks,
  modelExports,
  oauthAccessToken,
  oauthClient,
  oauthClientAssertion,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
  projects,
  renderDeliveryMode,
  renderJobState,
  revisionArtifacts,
  revisions,
  session,
  user,
  validationAttempts,
  verification,
  workerExportJobs,
  workerExportState,
  workerValidationJobs,
};
export const schema = {
  account,
  browserPresence,
  browserPreviewJobs,
  browserRenderJobs,
  candidates,
  candidateArtifacts,
  exportDownloadTokens,
  jwks,
  modelExports,
  oauthAccessToken,
  oauthClient,
  oauthClientAssertion,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
  projects,
  revisions,
  revisionArtifacts,
  session,
  user,
  validationAttempts,
  verification,
  workerExportJobs,
  workerValidationJobs,
};
