# Installation

Initial target: Codex on Apple Silicon macOS, Node 24 and Docker Desktop/Compose
v2. Other platforms have not passed local-edition acceptance. No hosted account,
local PostgreSQL installation, separate pnpm installation or cloud API key is
required for CAD operations. The browser account belongs only to this instance.

The worker package and local images are release candidates. Public npm/image/plugin
publication and renderer distribution clearance are separate release gates. Do not
claim a public download exists or replace a missing pin with `latest`.

Released workers include immutable image digests. `local start` downloads missing
app, tooling and PostgreSQL images automatically; the first start requires network
access. Cached starts reuse those exact images without contacting the registry.
For `IMAGE_PULL_FAILED`, check connectivity and release/platform availability, then
retry the same command. Existing installation secrets and volumes are preserved.

Before publication, an operator can load the inspected release images with
`docker load`, or build from an explicitly selected repository checkout:

```sh
node "<PLUGIN_ROOT>/skills/theoryfoundry-local/scripts/pluginCli.script.mjs" local start --source /absolute/path/to/3d_model_mcp --json
```

Building requires dependency and pinned renderer downloads. Runtime assets are
included in the worker and application images. A source build is not an offline
installation. For a pre-publication candidate, set `THEORYFOUNDRY_LOCAL_CLI` to its
absolute installed `dist/cli.js` path; the launcher checks its exact version.

After installation, start/call operations reuse local images/assets and credentials.
No package manager cache, checkout or plugin directory stores project history.
