import {
  parameterSnapshotSchema,
  type ProjectParameter,
} from "@theoryfoundry/contracts";
import { CadDomainError } from "./cadDomainError.util.js";
import {
  parameterTokens,
  type ParameterToken,
} from "./parameterTokens.util.js";

export const PARAMETER_HEADER_START = "// theoryfoundry:parameters:start v1";
export const PARAMETER_HEADER_END = "// theoryfoundry:parameters:end";

/** Storage guard: registered values must agree with literal header declarations. */
export function checkedParameterSnapshot(
  source: string,
  raw: unknown,
): ProjectParameter[] {
  const parsed = parameterSnapshotSchema.safeParse(
    raw === undefined ? [] : raw,
  );
  if (!parsed.success)
    throw new CadDomainError(
      "INVALID_PARAMETERS",
      "Invalid parameter definitions or values.",
      { reason: parsed.error.message },
    );
  const parameters = parsed.data.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  if (!parameters.length) return parameters;
  try {
    const tokens = parameterTokens(source);
    const markers = tokens
      .map((token, index) => ({ token, index }))
      .filter(
        ({ token }) =>
          token.kind === "comment" &&
          /^\/\/ theoryfoundry:parameters:/.test(token.text),
      );
    if (
      markers.length !== 2 ||
      markers[0]?.token.text !== PARAMETER_HEADER_START ||
      markers[1]?.token.text !== PARAMETER_HEADER_END
    )
      throw new Error(
        "Registered parameters require one dedicated v1 parameter header.",
      );
    for (const { token } of markers) {
      const lineStart =
        Math.max(
          source.lastIndexOf("\n", token.offset - 1),
          source.lastIndexOf("\r", token.offset - 1),
        ) + 1;
      if (source.slice(lineStart, token.offset).trim())
        throw new Error("Header markers must occupy their own lines.");
    }
    const start = markers[0].index;
    const end = markers[1].index;
    if (tokens.slice(0, start).some((token) => token.kind !== "comment"))
      throw new Error("Parameter header must precede model code.");
    const header = tokens
      .slice(start + 1, end)
      .filter((token) => token.kind !== "comment");
    const values = new Map<string, string | number | boolean>();
    let cursor = 0;
    const take = (): ParameterToken => {
      const token = header[cursor++];
      if (!token) throw new Error("Incomplete parameter declaration.");
      return token;
    };
    while (cursor < header.length) {
      const name = take();
      if (
        name.kind !== "identifier" ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name.text) ||
        ["true", "false", "undef"].includes(name.text) ||
        take().text !== "="
      )
        throw new Error("Header must contain scalar literal assignments only.");
      let literal = take();
      let sign = 1;
      if (literal.text === "-" || literal.text === "+") {
        sign = literal.text === "-" ? -1 : 1;
        literal = take();
        if (literal.kind !== "number")
          throw new Error("Expected a numeric literal after sign.");
      }
      let value: string | number | boolean;
      if (literal.kind === "number") value = sign * Number(literal.text);
      else if (literal.kind === "string" && literal.validLiteral)
        value = literal.value!;
      else if (literal.text === "true" || literal.text === "false")
        value = literal.text === "true";
      else throw new Error("Header value must be a scalar literal.");
      if (typeof value === "number" && !Number.isFinite(value))
        throw new Error("Header number must be finite.");
      if (take().text !== ";" || values.has(name.text))
        throw new Error("Incomplete or duplicate parameter declaration.");
      values.set(name.text, value);
    }
    const body = tokens
      .slice(end + 1)
      .filter((token) => token.kind !== "comment");
    for (const parameter of parameters) {
      if (
        !values.has(parameter.binding) ||
        values.get(parameter.binding) !== parameter.value
      )
        throw new Error(
          `Parameter ${parameter.id} does not match header binding ${parameter.binding}.`,
        );
      for (let index = 0; index < body.length; index++)
        if (
          body[index]?.text === parameter.binding &&
          body[index]?.kind === "identifier" &&
          body[index + 1]?.text === "=" &&
          body[index + 2]?.text !== "="
        )
          throw new Error(
            `Conflicting assignment to ${parameter.binding} outside the header.`,
          );
    }
    return parameters;
  } catch (error) {
    throw new CadDomainError(
      "INVALID_PARAMETERS",
      "Parameter header does not match the snapshot.",
      {
        reason:
          error instanceof Error ? error.message : "Invalid parameter header.",
      },
    );
  }
}
