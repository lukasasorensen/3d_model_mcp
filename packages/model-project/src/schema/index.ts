import { account } from "./account.schema.js";
import { browserRenderJobs } from "./browser-render-job.schema.js";
import { candidateArtifacts } from "./candidate-artifact.schema.js";
import { candidates } from "./candidate.schema.js";
import { projects } from "./project.schema.js";
import { revisionArtifacts } from "./revision-artifact.schema.js";
import { revisions } from "./revision.schema.js";
import { session } from "./session.schema.js";
import { user } from "./user.schema.js";
import { verification } from "./verification.schema.js";

export { account } from "./account.schema.js";
export { browserRenderJobs } from "./browser-render-job.schema.js";
export { candidateArtifacts } from "./candidate-artifact.schema.js";
export { candidateState } from "./candidate-state.enum.js";
export { candidates } from "./candidate.schema.js";
export { projects } from "./project.schema.js";
export { renderJobState } from "./render-job-state.enum.js";
export { revisionArtifacts } from "./revision-artifact.schema.js";
export { revisions } from "./revision.schema.js";
export { session } from "./session.schema.js";
export { user } from "./user.schema.js";
export { verification } from "./verification.schema.js";

export const schema = {
  user,
  session,
  account,
  verification,
  projects,
  candidates,
  revisions,
  candidateArtifacts,
  revisionArtifacts,
  browserRenderJobs,
};
