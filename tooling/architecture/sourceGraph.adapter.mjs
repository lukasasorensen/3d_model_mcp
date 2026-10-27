import { isBuiltin } from "node:module";
import path from "node:path";
import { existsSync } from "node:fs";
import ts from "typescript";
import {
  createWorkspaceProgram,
  relativeTo,
} from "./workspaceSource.repository.mjs";
import { describeSource, boundaryRules } from "./sourceLayers.policy.mjs";
import { exportedDeclarations } from "./exportOrigins.util.mjs";
import { runtimeAssetReference } from "./runtimeAssets.policy.mjs";
import { cycleEdges } from "./graphCycles.util.mjs";

const serverPackages = new Set([
  "@theoryfoundry/runtime",
  "@theoryfoundry/model-project",
  "@theoryfoundry/mcp",
  "@theoryfoundry/gateway",
  "@theoryfoundry/renderer",
]);
const browserPackages = new Set([
  "@theoryfoundry/contracts",
  "@theoryfoundry/browser-renderer",
]);
const serverImport = (name) =>
  isBuiltin(name) ||
  serverPackages.has(name) ||
  /^(?:server-only|next\/server|next\/headers|pg|drizzle-orm|@electric-sql\/pglite|langchain|@langchain\/|@anthropic-ai\/|openai(?:\/|$)|@google\/generative-ai)/.test(
    name,
  );
const addEdge = (edges, from, to) => {
  if (!edges.has(from)) edges.set(from, new Set());
  edges.get(from).add(to);
};
export const findingKey = ({ file, rule, target = "" }) =>
  JSON.stringify([file, rule, target]);

export function checkSourceGraph(workspace) {
  const { program, checker, resolve } = createWorkspaceProgram(workspace);
  const findings = new Map(),
    fileEdges = new Map(),
    moduleEdges = new Map(),
    runtimeEdges = new Map(),
    externalEdges = new Map(),
    browserEntries = new Set();
  const report = (file, rule, target, message) => {
    const finding = { file, rule, target, message };
    findings.set(findingKey(finding), finding);
  };
  const sourceFiles = program
    .getSourceFiles()
    .filter((source) => workspace.files.includes(source.fileName));
  function targetCheck(
    from,
    absolute,
    semantic,
    specifier,
    runtime,
    declaration,
    typeOnly = false,
  ) {
    let to = describeSource(workspace, absolute);
    if (!to) return;
    if (semantic && to.layer === "barrel" && declaration) {
      // Legacy indexes may still define values; they cannot hide peer capabilities.
      to = {
        ...to,
        layer:
          ts.isInterfaceDeclaration(declaration) ||
          ts.isTypeAliasDeclaration(declaration)
            ? "types"
            : "service",
      };
    }
    for (const finding of boundaryRules(
      from,
      to,
      semantic,
      specifier,
      typeOnly,
    ))
      report(finding.file, finding.rule, finding.target, finding.message);
    if (!semantic) addEdge(fileEdges, from.file, to.file);
    if (from.module !== to.module) addEdge(moduleEdges, from.module, to.module);
    if (!semantic && runtime) addEdge(runtimeEdges, from.file, to.file);
  }
  for (const source of sourceFiles) {
    const from = describeSource(workspace, source.fileName);
    if (!from) continue;
    if (!from.layer)
      report(
        from.file,
        "unknown-layer",
        "",
        "Assign a role/layer while migrating this file; keep one cohesive capability.",
      );
    if (
      browserPackages.has(from.project.name) ||
      source.statements.some(
        (s) =>
          ts.isExpressionStatement(s) &&
          ts.isStringLiteral(s.expression) &&
          s.expression.text === "use client",
      )
    )
      browserEntries.add(from.file);
    if (
      from.layer === "barrel" &&
      source.statements.some(
        (s) => !ts.isExportDeclaration(s) || !s.moduleSpecifier,
      )
    )
      report(
        from.file,
        "barrel-logic",
        "",
        "Keep public indexes re-export-only; move construction or implementation into explicit modules.",
      );
    if (["types", "port"].includes(from.layer)) {
      for (const statement of source.statements) {
        const typeImport =
          ts.isImportDeclaration(statement) &&
          (statement.importClause?.isTypeOnly ||
            (statement.importClause?.namedBindings &&
              ts.isNamedImports(statement.importClause.namedBindings) &&
              statement.importClause.namedBindings.elements.every(
                (e) => e.isTypeOnly,
              )));
        const typeExport =
          ts.isExportDeclaration(statement) &&
          (statement.isTypeOnly ||
            (statement.exportClause &&
              ts.isNamedExports(statement.exportClause) &&
              statement.exportClause.elements.every((e) => e.isTypeOnly)));
        if (
          !ts.isInterfaceDeclaration(statement) &&
          !ts.isTypeAliasDeclaration(statement) &&
          !typeImport &&
          !typeExport
        )
          report(
            from.file,
            "contract-implementation",
            "",
            "Keep types and ports free of runtime behavior and values.",
          );
      }
    }
    const check = (
      literal,
      symbols = [],
      namespace = false,
      runtime = true,
    ) => {
      if (runtimeAssetReference(literal, from.project.name)) return;
      if (!literal || !ts.isStringLiteralLike(literal)) {
        report(
          from.file,
          "dynamic-import",
          literal?.getText(source) ?? "<missing>",
          "Use a literal dependency; dynamic asset loaders require an individually reviewed legacy exception.",
        );
        return;
      }
      const specifier = literal.text;
      if (isBuiltin(specifier)) {
        if (runtime) addEdge(externalEdges, from.file, specifier);
        return;
      }
      const resolved = resolve(specifier, source.fileName);
      if (!resolved) {
        const asset =
          specifier.startsWith(".") &&
          /\.(?:css|json|svg|wasm)$/.test(specifier) &&
          existsSync(path.resolve(path.dirname(source.fileName), specifier));
        if (!asset)
          report(
            from.file,
            "unresolved-import",
            specifier,
            "Fix the specifier or declare the dependency; imports must resolve without stale build output.",
          );
        return;
      }
      const absolute = path.resolve(resolved.resolvedFileName);
      const to = describeSource(workspace, absolute);
      if (to) {
        targetCheck(
          from,
          absolute,
          false,
          specifier,
          runtime,
          undefined,
          !runtime,
        );
        const selected = namespace
          ? [checker.getSymbolAtLocation(literal)]
          : symbols;
        for (const symbol of selected) {
          for (const declaration of exportedDeclarations(checker, symbol)) {
            targetCheck(
              from,
              path.resolve(declaration.getSourceFile().fileName),
              true,
              specifier,
              false,
              declaration,
              !runtime,
            );
          }
        }
      } else if (
        resolved.isExternalLibraryImport ||
        absolute.includes(`${path.sep}node_modules${path.sep}`)
      ) {
        if (runtime) addEdge(externalEdges, from.file, specifier);
      } else
        report(
          from.file,
          "outside-source",
          relativeTo(workspace.root, absolute),
          "Production code must not depend on tests, tooling or emitted artifacts; import the source public API.",
        );
      if (runtime && serverImport(specifier))
        addEdge(externalEdges, from.file, specifier);
    };
    const visit = (node) => {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause,
          names = clause?.namedBindings;
        const symbols = [];
        if (clause?.name)
          symbols.push(checker.getSymbolAtLocation(clause.name));
        if (names && ts.isNamedImports(names))
          for (const element of names.elements)
            symbols.push(checker.getSymbolAtLocation(element.name));
        const typeOnly =
          clause?.isTypeOnly ||
          (names &&
            ts.isNamedImports(names) &&
            names.elements.length > 0 &&
            names.elements.every((e) => e.isTypeOnly) &&
            !clause?.name);
        check(
          node.moduleSpecifier,
          symbols,
          !clause || (names && ts.isNamespaceImport(names)),
          !typeOnly,
        );
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const named = node.exportClause && ts.isNamedExports(node.exportClause);
        const symbols = named
          ? node.exportClause.elements.map((e) =>
              checker.getSymbolAtLocation(e.name),
            )
          : [];
        const typeOnly =
          node.isTypeOnly ||
          (named &&
            node.exportClause.elements.length > 0 &&
            node.exportClause.elements.every((e) => e.isTypeOnly));
        check(
          node.moduleSpecifier,
          from.layer === "barrel" ? [] : symbols,
          from.layer !== "barrel" && !named,
          !typeOnly,
        );
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument)
      ) {
        check(
          node.argument.literal,
          node.qualifier ? [checker.getSymbolAtLocation(node.qualifier)] : [],
          !node.qualifier,
          false,
        );
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      )
        check(node.arguments[0], [], true);
      else if (
        ts.isImportEqualsDeclaration(node) ||
        (ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "require")
      )
        report(
          from.file,
          "esm-only",
          node.getText(source),
          "Use ESM imports so selected exports and layers can be checked.",
        );
      else if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "URL" &&
        node.arguments?.[1]?.getText(source) === "import.meta.url"
      )
        check(node.arguments[0], [], false);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const [file, target] of cycleEdges(fileEdges))
    report(
      file,
      "file-cycle",
      target,
      "Break this resolved dependency cycle, including type-only and re-export edges.",
    );
  for (const [file, target] of cycleEdges(moduleEdges))
    report(
      file,
      "module-cycle",
      target,
      "Break the conceptual module cycle even if individual files are acyclic.",
    );
  for (const entry of browserEntries) {
    const pending = [entry],
      seen = new Set();
    while (pending.length) {
      const current = pending.pop();
      if (seen.has(current)) continue;
      seen.add(current);
      for (const external of externalEdges.get(current) ?? [])
        if (serverImport(external))
          report(
            entry,
            "browser-server",
            `${current} -> ${external}`,
            "Keep server dependencies out of browser/client/worker runtime graphs; use a browser-safe contract or transport.",
          );
      pending.push(...(runtimeEdges.get(current) ?? []));
    }
  }
  return { findings: [...findings.values()], fileEdges, moduleEdges };
}
