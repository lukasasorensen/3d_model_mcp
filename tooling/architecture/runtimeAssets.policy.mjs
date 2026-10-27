import ts from "typescript";

// This resource is served by both hosts and hash-verified before import by the worker.
// It has no workspace source module; arbitrary computed imports remain forbidden.
export function runtimeAssetReference(node, packageName) {
  if (
    packageName !== "@theoryfoundry/browser-renderer" ||
    !node ||
    !ts.isPropertyAccessExpression(node) ||
    node.name.text !== "href"
  )
    return false;
  const url = node.expression;
  return (
    ts.isNewExpression(url) &&
    ts.isIdentifier(url.expression) &&
    url.expression.text === "URL" &&
    url.arguments?.length === 2 &&
    ts.isStringLiteral(url.arguments[0]) &&
    url.arguments[0].text === "/vendor/openscad/openscad.js"
  );
}
