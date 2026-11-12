export interface ParameterToken {
  kind: "comment" | "string" | "number" | "identifier" | "punctuation";
  text: string;
  offset: number;
  value?: string;
  validLiteral?: boolean;
}

/** A bounded lexical pass; it does not interpret the OpenSCAD model body. */
export function parameterTokens(source: string): ParameterToken[] {
  const tokens: ParameterToken[] = [];
  let position = 0;
  while (position < source.length) {
    const rest = source.slice(position);
    const whitespace = /^\s+/.exec(rest)?.[0];
    if (whitespace) {
      position += whitespace.length;
      continue;
    }
    const comment = /^(?:\/\/[^\n\r]*|\/\*[\s\S]*?\*\/)/.exec(rest)?.[0];
    if (comment) {
      tokens.push({ kind: "comment", text: comment, offset: position });
      position += comment.length;
      continue;
    }
    if (rest.startsWith("/*")) throw new Error("Unterminated source comment.");
    if (rest[0] === '"') {
      const offset = position;
      let text = '"';
      let value = "";
      position++;
      let closed = false;
      let validLiteral = true;
      while (position < source.length) {
        const character = source[position++]!;
        text += character;
        if (character === '"') {
          closed = true;
          break;
        }
        if (character === "\n" || character === "\r")
          throw new Error("Unterminated source string.");
        if (character === "\\") {
          const escaped = source[position++] ?? "";
          text += escaped;
          const escapes: Record<string, string> = {
            n: "\n",
            r: "\r",
            t: "\t",
            '"': '"',
            "\\": "\\",
          };
          if (!(escaped in escapes)) validLiteral = false;
          value += escapes[escaped] ?? `\\${escaped}`;
        } else value += character;
      }
      if (!closed) throw new Error("Unterminated source string.");
      tokens.push({ kind: "string", text, value, validLiteral, offset });
      continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest)?.[0];
    const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(rest)?.[0];
    const text = number ?? identifier ?? source[position]!;
    tokens.push({
      kind: number ? "number" : identifier ? "identifier" : "punctuation",
      text,
      offset: position,
    });
    position += text.length;
  }
  return tokens;
}
