import ts from "typescript";

export function exportedDeclarations(checker, symbol, seen = new Set()) {
  if (!symbol || seen.has(symbol)) return [];
  seen.add(symbol);
  if (symbol.flags & ts.SymbolFlags.Alias)
    return exportedDeclarations(
      checker,
      checker.getAliasedSymbol(symbol),
      seen,
    );
  if (symbol.flags & ts.SymbolFlags.Module)
    return checker
      .getExportsOfModule(symbol)
      .flatMap((exported) => exportedDeclarations(checker, exported, seen));
  return symbol.declarations ?? [];
}
