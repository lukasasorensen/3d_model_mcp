# Canonical demo and verification

## Local setup

1. Install Node `>=22.9.0` and pnpm `11.17.0`.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm prepare:browser-renderer`; this downloads and verifies the pinned
   OpenSCAD WASM and BOSL2 archives.
4. Run `pnpm verify`, then `pnpm dev`.

To run the same CAD tools from a ChatGPT-authenticated local Codex client while
the browser performs validation, follow “Test the MCP tools with Codex” in the
root README. This requires the opt-in local MCP bridge and a visible browser tab.

The UI uses the credential-free `RJLS_CHAT_PROVIDER=mock`. Enter these requests in
one project:

1. “Create an 80 × 40 mm mounting bracket with a 6 mm base and two 5 mm mounting holes.”
2. “Widen the current bracket to 100 mm and move the holes to 70 mm spacing.”
3. “Add two symmetric 6 mm gussets with 20 mm forward and upward legs.”
4. “Export the current R3 as 3MF.”

Expected source facts are frozen in `fixtures/canonical-demo`: origin at base center
and Z=0; R1 bounds 80×40×46 with hole centers ±25,-10; R2 bounds 100×40×46 with
hole centers ±35,-10; R3 gussets centered at X=±35 spanning Y=-6..14 and Z=6..26;
3MF declares millimeters and binds R3's revision/source hash.

## Commands

```bash
pnpm --filter @rjls/runtime test
pnpm --filter @rjls/site test
pnpm verify
```

The runtime integration suite executes the actual LangChain `createAgent`, official
MCP SDK client/server, repository, strict contracts, deterministic binary artifact
parsers, restore semantics, hostile cases, and observability evidence. The injected
renderer is explicitly test-only and must not be reported as browser WASM evidence.

Real browser OpenSCAD/BOSL2 smoke evidence requires a browser test backend.
Browser screenshots at 1440×900, 1100×800, 900×1024,
768×1024, and 390×844 plus Chromium decode/heap traces remain environment-blocked
when no browser backend is installed. Live-provider evaluation and default selection
remain blocked behind CP-4A/CP-4B. A2A is deferred research only; no A2A runtime or
compatibility claim exists.
