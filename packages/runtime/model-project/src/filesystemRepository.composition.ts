import type { ModelProjectRepositoryOptions } from "./domains/project/index.js";
import {
  FileCandidateValidation,
  FileProjectLocks,
  FileProjectPublication,
  FileProjectQueries,
  FileProjectRecords,
  FileProjectWorkflow,
  durableFiles,
} from "./infrastructure/index.js";
export class ModelProjectRepository {
  private readonly workflow: FileProjectWorkflow;
  constructor(options: ModelProjectRepositoryOptions) {
    const locks = new FileProjectLocks(options, durableFiles);
    const records = new FileProjectRecords(options, durableFiles, locks);
    const publication = new FileProjectPublication(options, durableFiles);
    const validation = new FileCandidateValidation(
      options,
      durableFiles,
      locks,
      records,
    );
    const queries = new FileProjectQueries(options, durableFiles, records);
    this.workflow = new FileProjectWorkflow(
      options,
      durableFiles,
      locks,
      records,
      publication,
      validation,
      queries,
    );
  }
  createProject: FileProjectWorkflow["createProject"] = (...args) =>
    this.workflow.createProject(...args);
  updateProject: FileProjectWorkflow["updateProject"] = (...args) =>
    this.workflow.updateProject(...args);
  getCandidate: FileProjectWorkflow["getCandidate"] = (...args) =>
    this.workflow.getCandidate(...args);
  proposeModelSource: FileProjectWorkflow["proposeModelSource"] = (...args) =>
    this.workflow.proposeModelSource(...args);
  validateAndRender: FileProjectWorkflow["validateAndRender"] = (...args) =>
    this.workflow.validateAndRender(...args);
  promoteCandidate: FileProjectWorkflow["promoteCandidate"] = (...args) =>
    this.workflow.promoteCandidate(...args);
  getProjectState: FileProjectWorkflow["getProjectState"] = (...args) =>
    this.workflow.getProjectState(...args);
  listProjects: FileProjectWorkflow["listProjects"] = (...args) =>
    this.workflow.listProjects(...args);
  readValidatedCandidateSource: FileProjectWorkflow["readValidatedCandidateSource"] =
    (...args) => this.workflow.readValidatedCandidateSource(...args);
  readModelSource: FileProjectWorkflow["readModelSource"] = (...args) =>
    this.workflow.readModelSource(...args);
  listRevisions: FileProjectWorkflow["listRevisions"] = (...args) =>
    this.workflow.listRevisions(...args);
  getExportMetadata: FileProjectWorkflow["getExportMetadata"] = (...args) =>
    this.workflow.getExportMetadata(...args);
  readArtifact: FileProjectWorkflow["readArtifact"] = (...args) =>
    this.workflow.readArtifact(...args);
  restoreRevision: FileProjectWorkflow["restoreRevision"] = (...args) =>
    this.workflow.restoreRevision(...args);
}
