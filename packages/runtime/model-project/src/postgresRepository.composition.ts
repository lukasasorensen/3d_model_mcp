import {
  CandidateValidationService,
  ModelSourceService,
  PostgresProjectWorkflow,
  VALIDATION_POLICY_VERSION,
} from "./domains/project/index.js";
import { PostgresProjectPersistence } from "./infrastructure/index.js";
import type { PostgresModelProjectRepositoryOptions } from "./postgresRepository.types.js";
export class PostgresModelProjectRepository {
  private readonly workflow: PostgresProjectWorkflow;
  constructor(options: PostgresModelProjectRepositoryOptions) {
    if (!options.ownerId) throw new Error("A repository owner is required.");
    const validation = new CandidateValidationService({
      clock: options.clock ?? ((): Date => new Date()),
      validationPolicyVersion:
        options.validationPolicyVersion ?? VALIDATION_POLICY_VERSION,
      acceptRendererProvenance: options.acceptRendererProvenance,
    });
    const persistence = new PostgresProjectPersistence(
      options.pool,
      options.ownerId,
    );
    this.workflow = new PostgresProjectWorkflow(
      options,
      persistence,
      validation,
      new ModelSourceService(persistence),
    );
  }
  createProject: PostgresProjectWorkflow["createProject"] = (...args) =>
    this.workflow.createProject(...args);
  updateProject: PostgresProjectWorkflow["updateProject"] = (...args) =>
    this.workflow.updateProject(...args);
  listProjects: PostgresProjectWorkflow["listProjects"] = (...args) =>
    this.workflow.listProjects(...args);
  getProjectState: PostgresProjectWorkflow["getProjectState"] = (...args) =>
    this.workflow.getProjectState(...args);
  assertProjectAccess: PostgresProjectWorkflow["assertProjectAccess"] = (
    ...args
  ) => this.workflow.assertProjectAccess(...args);
  getProjectSnapshot: PostgresProjectWorkflow["getProjectSnapshot"] = (
    ...args
  ) => this.workflow.getProjectSnapshot(...args);
  getCandidate: PostgresProjectWorkflow["getCandidate"] = (...args) =>
    this.workflow.getCandidate(...args);
  readValidatedCandidateSource: PostgresProjectWorkflow["readValidatedCandidateSource"] =
    (...args) => this.workflow.readValidatedCandidateSource(...args);
  readModelSource: PostgresProjectWorkflow["readModelSource"] = (...args) =>
    this.workflow.readModelSource(...args);
  listRevisions: PostgresProjectWorkflow["listRevisions"] = (...args) =>
    this.workflow.listRevisions(...args);
  proposeModelSource: PostgresProjectWorkflow["proposeModelSource"] = (
    ...args
  ) => this.workflow.proposeModelSource(...args);
  validateAndRender: PostgresProjectWorkflow["validateAndRender"] = (...args) =>
    this.workflow.validateAndRender(...args);
  promoteCandidate: PostgresProjectWorkflow["promoteCandidate"] = (...args) =>
    this.workflow.promoteCandidate(...args);
  getExportMetadata: PostgresProjectWorkflow["getExportMetadata"] = (...args) =>
    this.workflow.getExportMetadata(...args);
  restoreRevision: PostgresProjectWorkflow["restoreRevision"] = (...args) =>
    this.workflow.restoreRevision(...args);
}
