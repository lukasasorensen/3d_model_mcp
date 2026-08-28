# Engineering Guidelines

These instructions apply to the entire repository.

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
- Use kebab-case file names. Give role-specific files a consistent suffix such as `.schema.ts`, `.repository.ts`, or `.test.ts`.
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
