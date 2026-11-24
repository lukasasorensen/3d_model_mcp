---
name: connect-theoryfoundry
description: Help connect the TheoryFoundry plugin, select a CAD project, or troubleshoot missing CAD tools and browser rendering.
---

Use the TheoryFoundry MCP connection supplied by this plugin. Connect the user's
account through the client's MCP authorization controls; do not request tokens,
passwords, or client secrets in chat.

When the task needs an existing project, ask which one to use if the user has not
identified it. Inspect that project's state before suggesting changes. Connection
and project selection alone authorize only setup and inspection.

For hosted rendering, keep the matching signed-in TheoryFoundry project tab visible.
If rendering reports that a browser is required, return to that tab and retry the
requested operation. The plugin uses the hosted server, without a local worker.

If tools are missing, confirm the plugin is enabled and account authorization has
finished, then start a fresh session. For rejected OAuth redirects, give the operator
the exact callback URL shown by the client; never suggest wildcard callbacks.

If an older manual connection exposes duplicate CAD tools, verify this plugin's
connection works before helping the user remove the old configuration. Revoking
account access is a separate action from removing a duplicate server entry.
