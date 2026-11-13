import { SaxesParser } from "saxes";
import { NAME_RE } from "xmlchars/xml/1.0/ed5.js";
import { QgsError } from "./errors.ts";
import type { QgsProject, XmlElement, XmlNode } from "./types.ts";

// A controlled failure is preferable to a runtime stack overflow on edited trees.
const MAX_DEPTH = 512;

function checkName(value: string): void {
  if (typeof value !== "string" || !NAME_RE.test(value)) {
    throw new QgsError("INVALID_EDIT", `Invalid XML name: ${value}`);
  }
}

export function createElement(
  name: string,
  attributes: Record<string, string> = {},
  children: XmlNode[] = [],
): XmlElement {
  return { type: "element", name, attributes: { ...attributes }, children };
}

/** Direct children only, so similarly named descendants never match accidentally. */
export function findChildren(element: XmlElement, name?: string): XmlElement[] {
  return element.children.filter(
    (node): node is XmlElement =>
      node.type === "element" && (name === undefined || node.name === name),
  );
}

export function findChild(
  element: XmlElement,
  name: string,
): XmlElement | undefined {
  return findChildren(element, name)[0];
}

/** Includes descendant text and CDATA, but excludes comments and instructions. */
export function getText(element: XmlElement): string {
  const parts: string[] = [];
  const active = new Set<XmlElement>();
  function visit(current: XmlElement, depth: number): void {
    if (depth > MAX_DEPTH || active.has(current)) {
      throw new QgsError("INVALID_EDIT", "Cyclic or excessively deep XML tree");
    }
    active.add(current);
    for (const node of current.children) {
      if (node.type === "element") visit(node, depth + 1);
      else if (node.type === "text" || node.type === "cdata")
        parts.push(node.value);
    }
    active.delete(current);
  }
  visit(element, 1);
  return parts.join("");
}

/** Replaces the entire contents, including any child elements. */
export function setText(element: XmlElement, value: string): void {
  element.children = value === "" ? [] : [{ type: "text", value }];
}

function checkDoctype(value: string): void {
  // QGIS's external PUBLIC/SYSTEM declaration is metadata only. Never load DTDs
  // or accept internal subsets/custom entities, even if they are unreferenced.
  const quoted = `(?:"[^"<>]*"|'[^'<>]*')`;
  const allowed = new RegExp(
    `^\\s*qgis(?:\\s+(?:SYSTEM\\s+${quoted}|PUBLIC\\s+${quoted}\\s+${quoted}))?\\s*$`,
    "u",
  );
  if (!allowed.test(value)) {
    throw new QgsError(
      "INVALID_XML",
      "Only an external or empty qgis DOCTYPE is supported; internal DTD subsets are forbidden",
    );
  }
}

/** XML 1.0 reader shared by input parsing and output validation. */
export function readXml(xml: string): QgsProject {
  const parser = new SaxesParser({ xmlns: true, defaultXMLVersion: "1.0" });
  const stack: XmlElement[] = [];
  const before: QgsProject["before"] = [];
  const after: QgsProject["after"] = [];
  let root: XmlElement | undefined;
  let declaration: QgsProject["declaration"];

  function append(node: XmlNode): void {
    const parent = stack.at(-1);
    if (parent) parent.children.push(node);
    else if (
      node.type === "text" ||
      node.type === "comment" ||
      node.type === "instruction"
    ) {
      (root ? after : before).push(node);
    }
  }

  parser.on("xmldecl", (decl) => {
    if (decl.version !== "1.0") {
      throw new QgsError("INVALID_XML", "QGS requires XML 1.0");
    }
    declaration = {
      version: "1.0",
      ...(decl.encoding ? { encoding: decl.encoding } : {}),
      ...(decl.standalone
        ? { standalone: decl.standalone as "yes" | "no" }
        : {}),
    };
  });
  parser.on("doctype", (value) => {
    checkDoctype(value);
    before.push({ type: "doctype", value });
  });
  parser.on("opentag", (tag) => {
    if (stack.length >= MAX_DEPTH) {
      throw new QgsError(
        "INVALID_XML",
        `XML nesting exceeds ${MAX_DEPTH} elements`,
      );
    }
    const element = createElement(
      tag.name,
      Object.fromEntries(
        Object.values(tag.attributes).map((attr) => [attr.name, attr.value]),
      ),
    );
    if (stack.length === 0) root = element;
    else append(element);
    stack.push(element);
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.on("text", (value) => {
    append({ type: "text", value });
  });
  parser.on("cdata", (value) => {
    append({ type: "cdata", value });
  });
  parser.on("comment", (value) => {
    append({ type: "comment", value });
  });
  parser.on("processinginstruction", ({ target, body }) => {
    append({ type: "instruction", target, body });
  });
  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof QgsError) throw error;
    throw new QgsError(
      "INVALID_XML",
      `Invalid XML: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (!root) throw new QgsError("INVALID_XML", "XML has no root element");
  return { ...(declaration ? { declaration } : {}), before, root, after };
}

function escapeText(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/\r/gu, "&#13;");
}

function escapeAttribute(value: string): string {
  // Literal attribute whitespace is normalized by XML readers; references are not.
  return escapeText(value)
    .replace(/"/gu, "&quot;")
    .replace(/\t/gu, "&#9;")
    .replace(/\n/gu, "&#10;");
}

export function writeXml(project: QgsProject): string {
  const chunks: string[] = [];
  const active = new Set<XmlElement>();
  function write(
    node: XmlNode | { type: "doctype"; value: string },
    depth: number,
  ): void {
    switch (node.type) {
      case "element": {
        checkName(node.name);
        if (depth > MAX_DEPTH || active.has(node)) {
          throw new QgsError(
            "INVALID_EDIT",
            "Cyclic or excessively deep XML tree",
          );
        }
        active.add(node);
        chunks.push(`<${node.name}`);
        for (const [name, value] of Object.entries(node.attributes)) {
          checkName(name);
          if (typeof value !== "string") {
            throw new QgsError(
              "INVALID_EDIT",
              `Attribute ${name} must be a string`,
            );
          }
          chunks.push(` ${name}="${escapeAttribute(value)}"`);
        }
        if (node.children.length === 0) chunks.push("/>");
        else {
          chunks.push(">");
          for (const child of node.children) write(child, depth + 1);
          chunks.push(`</${node.name}>`);
        }
        active.delete(node);
        break;
      }
      case "text":
        chunks.push(escapeText(node.value));
        break;
      case "cdata":
        // Both the CDATA terminator and CR require leaving the literal section.
        chunks.push(
          `<![CDATA[${node.value.replace(/\]\]>/gu, "]]]]><![CDATA[>").replace(/\r/gu, "]]>&#13;<![CDATA[")}]]>`,
        );
        break;
      case "comment":
        if (node.value.includes("--") || node.value.endsWith("-")) {
          throw new QgsError(
            "INVALID_EDIT",
            "An XML comment cannot contain -- or end in -",
          );
        }
        chunks.push(`<!--${node.value}-->`);
        break;
      case "instruction":
        checkName(node.target);
        if (node.body.includes("?>")) {
          throw new QgsError(
            "INVALID_EDIT",
            "A processing instruction cannot contain ?>",
          );
        }
        chunks.push(`<?${node.target}${node.body ? ` ${node.body}` : ""}?>`);
        break;
      case "doctype":
        checkDoctype(node.value);
        chunks.push(
          `<!DOCTYPE${/^\s/u.test(node.value) ? "" : " "}${node.value}>`,
        );
        break;
      default:
        throw new QgsError("INVALID_EDIT", "Unknown XML node type");
    }
  }
  try {
    if (project.declaration) {
      if (project.declaration.version !== "1.0")
        throw new QgsError("INVALID_EDIT", "QGS requires XML 1.0");
      const standalone = project.declaration.standalone;
      // The return value is a Unicode string intended to be saved as UTF-8.
      chunks.push(
        `<?xml version="1.0" encoding="UTF-8"${standalone ? ` standalone="${escapeAttribute(standalone)}"` : ""}?>`,
      );
    }
    for (const node of project.before) write(node, 0);
    write(project.root, 1);
    for (const node of project.after) write(node, 0);
    const xml = chunks.join("");
    // Reuse the strict reader to catch invalid edited names, characters,
    // namespace bindings, and document structure rather than maintain two validators.
    readXml(xml);
    return xml;
  } catch (error) {
    if (error instanceof QgsError && error.code === "INVALID_EDIT") throw error;
    throw new QgsError(
      "INVALID_EDIT",
      `Cannot serialize XML: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
