export default {
  forbidden: [
    { name: "no-cycles", severity: "error", from: {}, to: { circular: true } },
    {
      name: "no-unresolved-imports",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".mts", ".cts", ".mjs", ".js", ".json"],
      conditionNames: ["import", "node", "default"],
    },
  },
};
