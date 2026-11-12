---
name: theoryfoundry-local
description: Start a fully local TheoryFoundry instance and create, inspect, revise, preview or export CAD models through its local rendering worker. Use for local self-hosting and CAD work without hosted TheoryFoundry.
---

Run the bundled launcher with Node 24 from the user's working directory:

```sh
node "<PLUGIN_ROOT>/skills/theoryfoundry-local/scripts/pluginCli.script.mjs" <command> <arguments>
```

The launcher pins the worker release. The plugin manager owns skill updates; treat
this plugin directory as read-only. Put source/input files and requested artifacts
in the user's workspace. CLI JSON is the result; diagnostics go to stderr. A
nonzero exit or `isError: true` is failure, even when a result file exists.

## Connect

1. Run `local status --json`. If absent or stopped, run `local start --json`.
   Prerequisites are Node 24 and Docker Desktop/Compose v2. If pinned images are
   unavailable, read [installation](references/installation.md). Do not substitute
   another release or download unreviewed images.
2. On first use, run `local setup`. The browser opens an account setup page; let the
   user enter their own credentials there. Never print the setup URL fragment,
   request a password in chat, or create a model for a connection-only request.
3. Run `connect --server <origin-from-start> --allow-loopback-http --json`.
   Authorization opens in the browser when needed. Credentials stay in the OS
   store. This does not register new MCP tools or require restarting the chat.
4. Run `tools --json` for the actual tool schemas. Invoke tools with
   `call <tool> --input-file <absolute-json-path> --json`. `list_projects` takes
   `{}`. Select the requested project by ID or URL; ask if names are ambiguous.

## Model workflow

Inspect `get_project_state` and `read_model_source` before editing. Propose against
the exact current parent, validate the immutable candidate, and fetch its preview:

```sh
node "<PLUGIN_ROOT>/skills/theoryfoundry-local/scripts/pluginCli.script.mjs" call get_model_preview --input-file /absolute/preview.json --output /absolute/preview.png --json
```

Inspect the returned PNG and show it to the user. Promote only a VALID candidate
whose parent is still current. Retry operational failures on the same candidate;
model rejection requires a source correction. Rendering needs no project tab.
Geometry validation does not establish fit, strength or printability.

For requested STL/3MF files, call `export_model` with `--output <absolute-path>`.
The CLI verifies the download against its receipt and refuses to overwrite files.
Report the returned local path. The local project URL is an optional editing view.

## Recovery and maintenance

Run `doctor --json --server <origin> --account <connected-account> --allow-loopback-http`
for renderer/account diagnostics. Run `connect` again after expired/revoked access.
Do not silently switch instances or accounts, remove live locks, reset volumes,
change origin ports, or roll back migrated databases.

For backups, restore, upgrades, occupied ports and shutdown, read
[maintenance](references/maintenance.md). Keep the local app running for the user's
next task unless they request stopping it. The per-call worker closes automatically.
Fully offline AI requires a separate local reasoning model; the CAD stack itself
has no hosted TheoryFoundry dependency.
