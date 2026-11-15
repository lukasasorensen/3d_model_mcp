import type { ProjectParameter } from "@theoryfoundry/contracts";
import { CadDomainError } from "./cadDomainError.util.js";
import {
  parameterTokens,
  type ParameterToken,
} from "./parameterTokens.util.js";

/** Conservative lexical checks, not scope resolution or proof of influence. */
export function assertParameterBody(
  body: string,
  parameters: ProjectParameter[],
  previous: ProjectParameter[],
): void {
  // Preserve legacy syntax handling while preventing generated-header adoption.
  if (
    !parameters.length &&
    !previous.length &&
    !body.includes("theoryfoundry:parameters:")
  )
    return;
  let tokens: ParameterToken[];
  try {
    tokens = parameterTokens(body);
  } catch (error) {
    throw new CadDomainError("INVALID_PARAMETERS", "Invalid model body.", {
      reason: error instanceof Error ? error.message : "Invalid source tokens.",
    });
  }
  const marker = tokens.find(
    (token) =>
      token.kind === "comment" &&
      /^\/\/\s*theoryfoundry:parameters:/.test(token.text),
  );
  if (marker)
    fail(
      body,
      marker,
      "GENERATED_HEADER",
      "Remove the read-only header from the body; edit parameter JSON instead.",
    );
  const code = tokens.filter((token) => token.kind !== "comment");
  const bindings = new Set(parameters.map((parameter) => parameter.binding));
  const removed = new Set(
    previous
      .map((parameter) => parameter.binding)
      .filter((binding) => !bindings.has(binding)),
  );
  const formals = formalArguments(code);
  for (let index = 0; index < code.length; index++) {
    const token = code[index]!;
    if (token.kind !== "identifier") continue;
    if (removed.has(token.text))
      fail(
        body,
        token,
        "REMOVED_BINDING",
        `Binding ${token.text} was removed or renamed. Update all body references explicitly.`,
        token.text,
      );
    if (parameters.length && token.text === "include")
      fail(
        body,
        token,
        "INCLUDE_CONFLICT",
        "Includes may overwrite managed bindings. Use a permitted use import or supply a self-contained body.",
      );
    if (!bindings.has(token.text)) continue;
    if (formals.has(index))
      fail(
        body,
        token,
        "SHADOWED_BINDING",
        `Argument ${token.text} shadows a managed binding. Rename the local argument.`,
        token.text,
      );
    if (code[index + 1]?.text === "=" && code[index + 2]?.text !== "=")
      fail(
        body,
        token,
        "BINDING_ASSIGNMENT",
        `Assignment or named argument ${token.text} conflicts with a managed binding. Rename it or use a positional argument.`,
        token.text,
      );
  }
}

// Recognize only formal-list positions, including anonymous functions. Defaults
// can contain nested expressions; names within those expressions are not formals.
function formalArguments(tokens: ParameterToken[]): Set<number> {
  const result = new Set<number>();
  const stack: { formal: boolean; argumentStart: boolean }[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    const context = stack.at(-1);
    if (context?.formal && context.argumentStart && token.kind === "identifier")
      result.add(index);
    if (context) context.argumentStart = false;
    if (token.kind !== "punctuation") continue;
    if (["(", "[", "{"].includes(token.text)) {
      const previous = tokens[index - 1];
      const declaration =
        previous?.kind === "identifier" &&
        (["function", "module"].includes(previous.text) ||
          (tokens[index - 2]?.kind === "identifier" &&
            ["function", "module"].includes(tokens[index - 2]!.text)));
      stack.push({
        formal: token.text === "(" && declaration,
        argumentStart: true,
      });
    } else if ([")", "]", "}"].includes(token.text)) stack.pop();
    else if (token.text === "," && context) context.argumentStart = true;
  }
  return result;
}

function fail(
  body: string,
  token: ParameterToken,
  diagnostic: string,
  reason: string,
  binding?: string,
): never {
  const prefix = body.slice(0, token.offset);
  const line = prefix.split("\n").length;
  const column = token.offset - prefix.lastIndexOf("\n");
  throw new CadDomainError(
    "INVALID_PARAMETERS",
    "Invalid parameters or model body.",
    {
      diagnostic,
      reason: reason.slice(0, 200),
      line,
      column,
      ...(binding ? { binding } : {}),
    },
  );
}
