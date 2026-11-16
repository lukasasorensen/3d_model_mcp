import { RendererError } from "./rendererError.util.js";

type TagName =
  | "model"
  | "Relationship"
  | "Default"
  | "Override"
  | "object"
  | "build"
  | "vertex"
  | "triangle"
  | "item";
interface XmlTag {
  attributes: string;
  start: number;
  end: number;
  closing: boolean;
  selfClosing: boolean;
}

function malformed(): never {
  throw new RendererError("INVALID_ARTIFACT", "3MF XML element is malformed.");
}

// This is the existing restricted 3MF profile, not a general XML parser. Advance
// past each tag once; malformed delimiters must not rescan the remaining input.
function* tags(xml: string, name: TagName): Generator<XmlTag> {
  const startPattern = new RegExp(`<(\\/?${name})(?=[\\s/>])`, "gi");
  for (;;) {
    const match = startPattern.exec(xml);
    if (!match) return;
    const end = xml.indexOf(">", startPattern.lastIndex);
    if (end < 0) malformed();
    const attributes = xml.slice(startPattern.lastIndex, end);
    if (attributes.includes("<")) malformed();
    const closing = match[1]!.startsWith("/");
    if (closing && attributes.trim() !== "") malformed();
    startPattern.lastIndex = end + 1;
    yield {
      attributes,
      start: match.index,
      end: end + 1,
      closing,
      selfClosing: /\/\s*$/.test(attributes),
    };
  }
}

export function* threeMfOpeningTags(
  xml: string,
  name: TagName,
): Generator<string> {
  for (const tag of tags(xml, name)) {
    if (!tag.closing) yield tag.attributes;
  }
}

export function* threeMfSections(
  xml: string,
  name: "object" | "build",
): Generator<{ attributes: string; body: string }> {
  let opening: XmlTag | undefined;
  for (const tag of tags(xml, name)) {
    if (!tag.closing) {
      if (opening || tag.selfClosing) malformed();
      opening = tag;
    } else {
      if (!opening) malformed();
      yield {
        attributes: opening.attributes,
        body: xml.slice(opening.end, tag.start),
      };
      opening = undefined;
    }
  }
  if (opening) malformed();
}
