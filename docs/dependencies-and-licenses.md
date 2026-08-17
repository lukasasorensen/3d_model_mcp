# Dependency and release inventory

The lockfile is authoritative for transitive versions. Direct runtime pins include:

| Component | Version | Role | License/release note |
| --- | ---: | --- | --- |
| Node.js | >=22.9.0 | runtime | distribution terms must be retained |
| pnpm | 11.17.0 | workspace manager | MIT |
| Next.js | 15.5.22 | site | MIT |
| React / React DOM | 18.3.1 | UI | MIT |
| Three.js | 0.179.1 | STL viewer | MIT |
| React Three Fiber | 8.18.0 | React/Three binding | MIT |
| LangChain | 1.5.2 | `createAgent` orchestration | MIT |
| LangChain Core | 1.2.4 | provider/model contracts | MIT |
| MCP TypeScript SDK | 1.30.0 | official client/server transports | MIT |
| Zod | 4.4.3 | boundary schemas | MIT |
| OpenSCAD | deployment pin required | separate renderer executable | GPL obligations and notices require release review |
| BOSL2 | deployment pin required | OpenSCAD library | retain upstream license/notice at the selected commit |

No repository/public-distribution license has been selected. Therefore this work is
implementation-ready but not approved for public release. Before distribution, the
owner must choose the repository license, capture the complete generated dependency
inventory, retain notices, and review OpenSCAD/BOSL2/container-runtime obligations.

No live provider SDK/default is selected. No public deployment is approved. A2A is
explicitly deferred; research must compare the then-current protocol independently
and cannot silently change the MCP boundary.
