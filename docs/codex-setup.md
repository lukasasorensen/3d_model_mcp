# Codex setup

Start Codex from the repository root. `AGENTS.md` supplies repository-wide instructions;
more specific instructions in an ancestor or nested directory can also apply. Read the
applicable guidance before editing, together with the issue and relevant package/docs.

Connect Linear and GitHub using your personal Codex integrations. Confirm access with
read-only issue/repository lookups. Select the current TheoryFoundry team and relevant
project from live context; never copy credentials or personal MCP configuration into
this repository. Keep machine paths, model choices and authentication in personal settings.

Use `docs/alignment-plan.md` to find the current migration stage. `pnpm test:list` shows
actual test ownership; `pnpm verify` is the handoff gate. New tooling lives in `tooling/`
and its tests in `tests/tooling/`. Documentation and decisions belong directly in `docs/`.
Read `docs/development-workflow.md` for commands, opt-in tests and the baseline ratchet.

When an integration is unavailable, continue authorized local work and record pending
tracking/publication steps. Fetch back saved Linear evidence and verify the published PR.
A tool configuration alone does not prove that a connection or a required check works.
