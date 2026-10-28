import {
  createProjectInputSchema,
  createProjectOutputSchema,
  exportModelInputSchema,
  exportModelOutputSchema,
  getProjectStateInputSchema,
  getProjectStateOutputSchema,
  listRevisionsInputSchema,
  listRevisionsOutputSchema,
  promoteCandidateInputSchema,
  promoteCandidateOutputSchema,
  proposeModelSourceInputSchema,
  proposeModelSourceOutputSchema,
  readModelSourceInputSchema,
  readModelSourceOutputSchema,
  restoreRevisionInputSchema,
  restoreRevisionOutputSchema,
  updateProjectInputSchema,
  updateProjectOutputSchema,
  validateAndRenderInputSchema,
  validateAndRenderOutputSchema,
} from "../../../domains/cad/index.js";
import {
  getModelPreviewInputSchema,
  previewMetadataSchema,
} from "../../../domains/preview/index.js";
const baseCatalog = {
  create_project: {
    title: "Create project",
    description:
      "Create a project for the authenticated owner with a name and description. Returns its project ID and configured project URL for subsequent CAD tools. Obtain fit-critical measurements or clearly disclose assumptions.",
    inputSchema: createProjectInputSchema,
    outputSchema: createProjectOutputSchema,
    readOnly: false,
  },
  update_project: {
    title: "Update project details",
    description:
      "Update a project's name or description. Omitted fields are preserved; the description must remain nonempty.",
    inputSchema: updateProjectInputSchema,
    outputSchema: updateProjectOutputSchema,
    readOnly: false,
  },
  get_project_state: {
    title: "Get project state",
    description:
      "Inspect the authoritative current CAD revision and its validated artifact metadata.",
    inputSchema: getProjectStateInputSchema,
    outputSchema: getProjectStateOutputSchema,
    readOnly: true,
  },
  read_model_source: {
    title: "Read model source",
    description:
      "Read canonical OpenSCAD source for the current or a historical opaque revision ID.",
    inputSchema: readModelSourceInputSchema,
    outputSchema: readModelSourceOutputSchema,
    readOnly: true,
  },
  propose_model_source: {
    title: "Propose model source",
    description:
      "Create an immutable candidate from bounded OpenSCAD source against an explicit current parent (null only for genesis).",
    inputSchema: proposeModelSourceInputSchema,
    outputSchema: proposeModelSourceOutputSchema,
    readOnly: false,
  },
  validate_and_render: {
    title: "Validate and render candidate",
    description:
      "Validate immutable source using the standard profile in a visible project browser. On BROWSER_REQUIRED open/focus projectUrl and retry the same candidate; on BROWSER_BUSY wait. Operational failures are retryable, not invalid models. Inspect get_model_preview before promotion. Geometry validation does not establish fit, strength or printability.",
    inputSchema: validateAndRenderInputSchema,
    outputSchema: validateAndRenderOutputSchema,
    readOnly: false,
  },
  promote_candidate: {
    title: "Promote candidate",
    description:
      "Atomically promote one validated candidate if its expected parent is still current.",
    inputSchema: promoteCandidateInputSchema,
    outputSchema: promoteCandidateOutputSchema,
    readOnly: false,
  },
  export_model: {
    title: "Generate downloadable export",
    description:
      "Generate or reuse STL/3MF for the current revision. Requires a visible ready project browser for new exports. Returns exact file hash, bytes, filename and an expiring bearer download link. Retrieve the link to save the file; tool success does not mean it was saved locally.",
    inputSchema: exportModelInputSchema,
    outputSchema: exportModelOutputSchema,
    readOnly: false,
  },
  list_revisions: {
    title: "List revisions",
    description:
      "List the authoritative revision chain from current to genesis.",
    inputSchema: listRevisionsInputSchema,
    outputSchema: listRevisionsOutputSchema,
    readOnly: true,
  },
  restore_revision: {
    title: "Restore revision",
    description:
      "Restore a historical valid source as a new child of the current revision without rewinding history.",
    inputSchema: restoreRevisionInputSchema,
    outputSchema: restoreRevisionOutputSchema,
    readOnly: false,
  },
  get_model_preview: {
    title: "Get model PNG preview",
    description:
      "Inspect a saved revision or VALID candidate as a PNG. Defaults to current revision and isometric view. On BROWSER_REQUIRED, focus an existing project tab or open the returned projectUrl visibly using browser tools, then retry; otherwise show the link. BROWSER_BUSY means wait rather than open another tab.",
    inputSchema: getModelPreviewInputSchema,
    outputSchema: previewMetadataSchema,
    readOnly: true,
  },
};
export function createCadToolCatalog(
  mode: "browser" | "local-worker" = "browser",
): typeof baseCatalog {
  const catalog = {
    ...baseCatalog,
    validate_and_render: { ...baseCatalog.validate_and_render },
    get_model_preview: { ...baseCatalog.get_model_preview },
    export_model: { ...baseCatalog.export_model },
  };
  if (mode === "local-worker") {
    catalog.validate_and_render.description =
      "Validate immutable source locally with managed Chromium and pinned OpenSCAD WASM. No visible project tab is required. Retry operational failures on the same candidate. Inspect get_model_preview before promotion. Geometry validation does not establish fit, strength or printability.";
    catalog.get_model_preview.description =
      "Inspect a saved revision or VALID candidate as a locally rendered 768px PNG. Defaults to the current revision and isometric view. No visible project tab is required.";
    catalog.export_model.description =
      "Generate or reuse STL/3MF for the current revision using the local renderer. Returns the hosted file hash, bytes, filename and expiring bearer download link. Retrieve the link to save the file; tool success does not mean it was saved locally.";
  }
  return catalog;
}
export function cadToolInstructions(
  mode: "browser" | "local-worker" = "browser",
): string {
  return (
    "Use only these project-scoped CAD tools. Inspect project state before editing, propose source against the exact current parent, validate_and_render before promotion, and promote only a VALID candidate. " +
    (mode === "browser"
      ? "Browser validation requires the matching CAD project to be open in a visible browser tab. "
      : "Validation, PNG rendering and exports run locally; no visible project tab is required. Repair worker authentication or runtime prerequisites outside the MCP handshake. ") +
    "Never infer revision or artifact success from prose."
  );
}
