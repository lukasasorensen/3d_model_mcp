# TheoryFoundry CAD plugin

Connect to hosted TheoryFoundry projects at https://3dai.theoryfoundry.com/mcp.
Enable the plugin in your client and connect your account through its MCP controls.
Approve CAD access, start a fresh session, and keep the matching signed-in project
tab visible while rendering. Each account can access only its own projects.

The package contains connection settings, a setup skill, and branding assets.
Rendering and CAD operations use the hosted service. It installs no local server,
worker, hooks, scripts, or npm dependencies.

Select your existing CAD project and inspect it before requesting model changes.
Removing a plugin does not necessarily revoke the OAuth grant: use Connected apps
in TheoryFoundry to revoke access. First verify the new connection before removing
any older manual server configuration that duplicates its tools.

Published directory links will be added after review. This source package is a
release candidate until its publication requirements and live acceptance are complete.
TheoryFoundry code and assets are proprietary. Publisher: Lukas Sorensen.
