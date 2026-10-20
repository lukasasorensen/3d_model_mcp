# Engineering Guidelines

These instructions apply to the entire repository.

## Linear work tracking

- Use the connected Linear MCP tools to track work. Before implementation, find and read the relevant issue; create one for substantial work when none exists, and avoid duplicates.
- Confirm the appropriate team and project from current Linear context. Reuse existing workflows and labels; do not invent deadlines or estimates.
- Keep issue statuses, dependencies, PR links, and verification evidence current. Verify saved updates.
- Link PRs with issue identifiers. Use `Fixes` when merging completes the issue, `Contributes to` for partial work, and `Relates to` for context only.
- Mark work Done only when its completion criteria are verified. Track implementation, deployment, and live acceptance separately when needed.
- Keep secrets and sensitive logs out of Linear. If access is unavailable, report pending updates and continue authorized work where possible.

## Design principles

- Keep modules focused on one cohesive responsibility. Split a file before it becomes a catch-all for unrelated behavior.
- Avoid god classes, god modules, and generic `utils` collections. Prefer small domain-named modules with explicit APIs.
- Organize code from stable domain concepts toward infrastructure details. Dependencies should point inward; UI, transport, database, and provider adapters must not own domain rules.
- Encapsulate repeated behavior behind a narrowly named function or type. Do not abstract merely because two lines look similar; abstract when the shared concept and invariants are the same.
- Prefer composition and explicit dependency injection over global mutable state, hidden singletons, or inheritance hierarchies.
- Preserve package boundaries. Use a package's public entry point instead of deep-importing its internals.

## Naming and structure

- Use names that describe domain intent. Avoid vague names such as `data`, `item`, `manager`, `helper`, or `process` when a precise name is available.
- Name booleans as predicates (`isReady`, `hasAccess`, `canPromote`) and collections with plural nouns.
- Keep terminology consistent across database, domain, API, and UI layers unless an adapter explicitly translates it.
- Use kebab-case domain names and explicit role suffixes before the extension, such as `.renderer.ts`, `.service.ts`, `.worker.ts`, `.adapter.ts`, `.client.ts`, `.util.ts`, `.metadata.ts`, `.schema.ts`, or `.repository.ts`. Apply the same convention to `.mjs` files; executable scripts should identify their role with `.script.mjs` or `.cli.mjs`.
- Folder hierarchy and file roles are complementary. A file must still name its role inside a matching folder: use `renderer/png.renderer.ts` and `services/download.service.ts`, not `renderer/png.ts` or `services/download.ts`. Do not remove role suffixes to avoid repetition.
- Colocate tests and preserve the implementation's full filename stem, such as `download.service.test.ts`. Conventional public barrels such as `index.ts` may retain their standard names.
- Group related files into meaningful domain or execution folders. Keep utilities narrowly named and cohesive; do not create catch-all utility files. When moving or renaming files, update imports, public exports, build inputs, commands, test discovery, and documentation together.
- Keep one primary concept per file. Barrel files may assemble and re-export concepts but must not contain business logic.
- Keep functions short enough that their control flow and side effects are evident. Extract policy decisions and validation from orchestration code.

## Database schemas and persistence

- Define one database table per `*.schema.ts` file. Put each enum in its own `*.enum.ts` file.
- Put reusable column and constraint factories in the schema `shared/` directory. Factories must create fresh Drizzle column instances for every table.
- Preserve SQL table, column, index, constraint, and enum names during structural refactors unless a migration is explicitly required.
- Keep ownership checks and authorization boundaries in every persistence path; never rely on an opaque identifier alone.
- Do not persist plaintext secrets or reusable tokens. Store a one-way hash when later verification is required.
- Commit generated migrations for intentional schema changes and verify that refactors which should be structural-only produce no migration.

## Quality bar

- Validate untrusted input at system boundaries and use domain-specific errors for expected failure modes.
- Preserve operational errors instead of disguising them as missing data or authorization failures.
- Close external resources during both normal shutdown and failed startup.
- Add regression coverage for fixes and tests for important invariants, including ownership isolation and secret handling.
- Run the narrowest relevant checks while iterating, then run `pnpm verify` before handing off a completed change.
