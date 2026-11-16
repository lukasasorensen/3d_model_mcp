# Dependency and release inventory

The lockfile is authoritative for transitive versions. Selected resolved runtime versions include:

| Component            |          Version | Role                                                    | License/release note                               |
| -------------------- | ---------------: | ------------------------------------------------------- | -------------------------------------------------- |
| Node.js              |          24.21.0 | runtime                                                 | distribution terms must be retained                |
| pnpm                 |          11.17.0 | workspace manager                                       | MIT                                                |
| Next.js              |           16.4.6 | site                                                    | MIT                                                |
| React / React DOM    |           19.2.8 | UI                                                      | MIT                                                |
| Three.js             |          0.179.1 | STL viewer                                              | MIT                                                |
| React Three Fiber    |            9.6.1 | React/Three binding                                     | MIT                                                |
| fflate               |            0.8.3 | browser/build ZIP extraction                            | MIT                                                |
| LangChain            |            1.5.2 | `createAgent` orchestration                             | MIT                                                |
| LangChain Core       |            1.2.4 | provider/model contracts                                | MIT                                                |
| MCP TypeScript SDK   |           1.32.0 | official client/server transports                       | MIT                                                |
| Zod                  |            4.6.7 | boundary schemas                                        | MIT                                                |
| Better Auth          |           1.7.25 | invite-only email/password accounts and cookie sessions | MIT                                                |
| Drizzle ORM / Kit    | 0.45.2 / 0.31.11 | PostgreSQL schema and committed migrations              | Apache-2.0                                         |
| node-postgres (`pg`) |           8.23.0 | bounded PostgreSQL connection pool and transactions     | MIT                                                |
| PGlite               |            0.5.8 | in-process PostgreSQL repository and OAuth tests        | Apache-2.0                                         |
| OpenSCAD WASM        |       2026.07.20 | browser Web Worker renderer                             | GPL obligations and notices require release review |
| BOSL2                |         v2.0.741 | browser-mounted OpenSCAD library                        | retain upstream license/notice at the selected tag |

No repository/public-distribution license has been selected. Therefore this work is
implementation-ready but not approved for public release. Before distribution, the
owner must choose the repository license, capture the complete generated dependency
inventory, retain notices, and review OpenSCAD/BOSL2 distribution obligations.

No live provider SDK/default is selected. No public deployment is approved. A2A is
explicitly deferred; research must compare the then-current protocol independently
and cannot silently change the MCP boundary.

## Security overrides (THE-72)

The November 16, 2026 dependency audit reported 66 advisory entries (65 distinct
advisory IDs). The updated lockfile reports zero across production, development,
and optional dependencies. This is a known-advisory check, not proof that every
package is free of vulnerabilities.

Stable parent upgrades replace four overrides: Next.js 16.4.6 supplies patched
PostCSS/Sharp, rimraf 6.1.4 supplies patched glob, and Better Auth/OAuth 1.7.25
naturally align core. ESLint 10.15.0 also supplies patched minimatch. Two narrow
exceptions remain:

- `@esbuild-kit/core-utils>esbuild`: 0.25.12, because stable Drizzle Kit 0.31.11
  still includes the legacy loader. Drizzle ORM remains 0.45.2; no v1 prerelease or
  migration-history conversion is introduced.
- `@typescript-eslint/typescript-estree>minimatch`: 11.0.8, because stable
  typescript-eslint 8.72.2 still requests minimatch 10. Remove when a stable parent
  adopts the patched major.

The Better Call 1.4.0 declaration patch is retired: Better Auth now supplies 1.4.5,
which includes that optional-property fix. The LangChain declaration patch remains.
Remove each remaining override when its parent resolves a patched compatible
version, then rerun audit, peer checks, full verification and package acceptance.
Next.js 16 uses Turbopack by default and `skipProxyUrlNormalize` to preserve exact
OAuth callback URLs. Node 24 supports the upgraded tooling. Renderer asset pins
and the once-per-PR package version bumps are unchanged.

### Better Auth database upgrade

Apply migration `0019_auth-provider-account-key` before starting the patched app
(`pnpm db:migrate` in a configured checkout). Better Auth 1.7.3+ identifies accounts
by provider ID and account ID and no longer writes the old required issuer field.
The migration retains historical issuer values and password hashes, makes issuer
nullable, and replaces issuer uniqueness with provider/account uniqueness. Invitation
creation follows the same key. See the [upstream upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide).

Before promotion, check for ambiguous keys with:

```sql
SELECT provider_id, account_id, count(*)
FROM account
GROUP BY provider_id, account_id
HAVING count(*) > 1;
```

The migration refuses duplicate keys; it never merges users or deletes accounts.
Resolve any duplicates against verified identities before retrying. This repository
configures email/password login, not social identity providers. Test existing login,
new invitation acceptance and OAuth authorization/refresh after deployment.
Local PGlite acceptance does not establish production migration or live acceptance.
