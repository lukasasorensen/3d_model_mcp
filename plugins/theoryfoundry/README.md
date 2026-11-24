# TheoryFoundry CAD plugin

Connect to hosted TheoryFoundry projects at https://3dai.theoryfoundry.com/mcp.
Enable the plugin in your client and connect your account through its MCP controls.
Approve CAD access, start a fresh session, and keep the matching signed-in project
tab visible while rendering. Each account can access only its own projects.

## Install a release candidate

From the TheoryFoundry checkout, run `pnpm pack:plugins`. Add the generated
`dist/mcp-plugins` catalog using its absolute path. Keep the catalog and its
client folders together.

```sh
# Codex CLI
codex plugin marketplace add /absolute/path/to/dist/mcp-plugins
codex plugin add theoryfoundry-cad@theoryfoundry

# Claude Code
claude plugin marketplace add /absolute/path/to/dist/mcp-plugins
claude plugin install theoryfoundry-cad@theoryfoundry --scope user
```

To update a candidate, rebuild the catalog at the same path, then reinstall
with `codex plugin add theoryfoundry-cad@theoryfoundry` or run
`claude plugin update theoryfoundry-cad@theoryfoundry --scope user`.
Start a fresh client session and connect through its MCP controls if prompted.

## Choose a skill

In Codex, type `$` and select the `theoryfoundry-cad` skill. In Claude Code,
invoke `/theoryfoundry-cad:<skill>` and add your request. A manual MCP connection
supplies the CAD tools. Install the plugin to add these skills.

| Skill                       | Example request                                                              |
| --------------------------- | ---------------------------------------------------------------------------- |
| `connect-theoryfoundry`     | Connect my account and help me find the right project.                       |
| `create-model`              | Make a 30 × 20 × 4 mm spacer and export it as STL.                           |
| `fix-model`                 | The hole in my Spacer project is off-center.                                 |
| `plan-model`                | Plan a two-hole bracket for this mounting surface. Keep it read-only.        |
| `create-model-from-drawing` | Model the attached bracket drawing. Ask about missing fit-critical measures. |

A standalone build request can start a project. A defect report about a selected
project can trigger a targeted correction. Say “diagnose only” for read-only
investigation or “preview only” to see a candidate before saving. If a preview
needs a new project, the agent will ask first. Project selection and planning
leave the model untouched.

The hosted plugin supplies the skills, hosted connection settings, and branding.
For the fully local edition, use its `theoryfoundry-local` skill, which connects
through a separate CLI and renders headlessly. The workflows share the same
revision and validation concepts. These four skills are packaged for the hosted
connection.

Removing a plugin does not necessarily revoke the OAuth grant: use Connected apps
in TheoryFoundry to revoke access. First verify the new connection before removing
any older manual server configuration that duplicates its tools.

Published directory links will be added after review. This source package is a
release candidate until its publication requirements and live acceptance are complete.
TheoryFoundry code and assets are proprietary. Publisher: Lukas Sorensen.
