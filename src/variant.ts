import { remove, replaceChildren } from "./codec.ts";
import { QgsError } from "./errors.ts";
import type {
  QgisVersion,
  QgsVariant,
  QgsVariantMap,
  XmlElement,
} from "./types.ts";
import { createElement, findChild, findChildren } from "./xml.ts";

// QgsXmlUtils::readVariant/writeVariant spellings.
const numeric = new Set(["int", "uint", "qlonglong", "qulonglong", "double"]);
const integral = new Set(["int", "uint", "qlonglong", "qulonglong"]);
const textual = new Set([
  "QString",
  "QChar",
  "color",
  "datetime",
  "date",
  "time",
  "QgsGeometry",
]);
// Types that wrap a single nested <Option> variant.
const wrappers = new Set([
  "QgsProperty",
  "QgsProcessingOutputLayerDefinition",
  "QgsProcessingFeatureSourceDefinition",
  "QgsRemappingSinkDefinition",
]);
const MAX_DEPTH = 256;

/** Path binder supplied by the extension codec while capturing layouts. */
export type Bind = (
  element: XmlElement,
  attribute: string,
  path: string[],
  format?: "boolean",
) => void;

const options = (element: XmlElement) => findChildren(element, "Option");

function deep(depth: number, code: "INVALID_PROJECT" | "INVALID_EDIT"): void {
  if (depth > MAX_DEPTH)
    throw new QgsError(code, "Cyclic or excessively deep variant value");
}

/**
 * Decode an <Option> element. Types QGIS reads as invalid, and opaque types
 * such as CRS values, decode to null; their XML is kept while the value stays null.
 */
export function readVariant(element: XmlElement, depth = 0): QgsVariant {
  deep(depth, "INVALID_PROJECT");
  const type = element.attributes.type ?? "";
  const value = element.attributes.value ?? "";
  if (type === "Map")
    return Object.fromEntries(
      options(element).map((child) => [
        child.attributes.name ?? "",
        readVariant(child, depth + 1),
      ]),
    );
  if (type === "List" || type === "StringList")
    return options(element).map((child) => readVariant(child, depth + 1));
  if (type === "bool") return value === "true";
  if (textual.has(type)) return value;
  if (numeric.has(type)) {
    if (value.trim() === "") return 0;
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
      throw new QgsError(
        "INVALID_PROJECT",
        `Expected a finite ${type} variant, received ${value}`,
      );
    return parsed;
  }
  if (wrappers.has(type)) {
    const inner = options(element)[0];
    return inner ? readVariant(inner, depth + 1) : null;
  }
  return null;
}

export function bindVariant(
  bind: Bind,
  element: XmlElement,
  path: string[],
  depth = 0,
): void {
  if (depth > MAX_DEPTH) return;
  const type = element.attributes.type ?? "";
  if (type === "Map")
    for (const child of options(element))
      bindVariant(
        bind,
        child,
        [...path, child.attributes.name ?? ""],
        depth + 1,
      );
  else if (type === "List" || type === "StringList")
    for (const [index, child] of options(element).entries())
      bindVariant(bind, child, [...path, String(index)], depth + 1);
  else if (wrappers.has(type)) {
    const inner = options(element)[0];
    if (inner) bindVariant(bind, inner, path, depth + 1);
  } else if (type === "bool") bind(element, "value", path, "boolean");
  else if (numeric.has(type) || textual.has(type)) bind(element, "value", path);
}

export function isMap(value: unknown): value is QgsVariantMap {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function numberType(value: number, current: string): string {
  if (!Number.isFinite(value))
    throw new QgsError("INVALID_EDIT", "Variant numbers must be finite");
  const integer = Number.isInteger(value);
  if (numeric.has(current)) {
    if (!integral.has(current)) return current;
    if (integer && !(current.startsWith("u") && value < 0)) return current;
  }
  if (!integer) return "double";
  return Math.abs(value) <= 2147483647 ? "int" : "qlonglong";
}

export function numberText(value: number): string {
  return Number.isInteger(value) ? BigInt(value).toString() : String(value);
}

/** Reconcile an <Option> element with a value, preserving matching children and types. */
export function writeVariant(
  element: XmlElement,
  value: QgsVariant,
  depth = 0,
): void {
  deep(depth, "INVALID_EDIT");
  const type = element.attributes.type ?? "";
  if (value === null) {
    // Unset, invalid, and opaque (e.g. CRS) values are kept as stored.
    if (
      type === "" ||
      type === "invalid" ||
      !(
        type === "Map" ||
        type === "List" ||
        type === "StringList" ||
        type === "bool" ||
        numeric.has(type) ||
        textual.has(type) ||
        wrappers.has(type)
      )
    )
      return;
    element.attributes.type = "invalid";
    delete element.attributes.value;
    remove(element, "Option");
    return;
  }
  if (Array.isArray(value)) {
    const existing = options(element);
    // QGIS omits the type of an empty container; reading it yields an invalid value.
    if (!(type === "" && value.length === 0))
      element.attributes.type =
        type === "StringList" && value.every((item) => typeof item === "string")
          ? "StringList"
          : "List";
    delete element.attributes.value;
    replaceChildren(
      element,
      ["Option"],
      value.map((item, index) => {
        const child = existing[index] ?? createElement("Option");
        delete child.attributes.name;
        writeVariant(child, item, depth + 1);
        return child;
      }),
    );
    return;
  }
  if (isMap(value)) {
    if (wrappers.has(type)) {
      const inner = options(element)[0] ?? createElement("Option");
      writeVariant(inner, value, depth + 1);
      replaceChildren(element, ["Option"], [inner]);
      return;
    }
    writeVariantMap(element, value, depth);
    return;
  }
  remove(element, "Option");
  if (typeof value === "string") {
    element.attributes.type = textual.has(type) ? type : "QString";
    element.attributes.value = value;
  } else if (typeof value === "boolean") {
    element.attributes.type = "bool";
    element.attributes.value = value ? "true" : "false";
  } else if (typeof value === "number") {
    element.attributes.type = numberType(value, type);
    element.attributes.value = numberText(value);
  } else
    throw new QgsError(
      "INVALID_EDIT",
      `Unsupported variant value of type ${typeof value}`,
    );
}

function writeVariantMap(
  element: XmlElement,
  value: QgsVariantMap,
  depth: number,
): void {
  const entries = Object.entries(value);
  if (!(element.attributes.type === undefined && entries.length === 0))
    element.attributes.type = "Map";
  delete element.attributes.value;
  const existing = options(element);
  const used = new Set<XmlElement>();
  const matched: XmlElement[] = [];
  const added: XmlElement[] = [];
  for (const [key, item] of entries) {
    const found = existing.find(
      (child) => !used.has(child) && child.attributes.name === key,
    );
    const child = found ?? createElement("Option", { name: key });
    used.add(child);
    writeVariant(child, item, depth + 1);
    (found ? matched : added).push(child);
  }
  matched.sort((a, b) => existing.indexOf(a) - existing.indexOf(b));
  replaceChildren(element, ["Option"], [...matched, ...added]);
}

function scalarText(value: QgsVariant, key: string): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new QgsError("INVALID_EDIT", `${key} must be finite`);
    return numberText(value);
  }
  if (typeof value === "string") return value;
  throw new QgsError(
    "INVALID_EDIT",
    `Property ${key} must be a scalar for QGIS versions before 3.18`,
  );
}

/** QGIS before 3.18 reads properties only from <prop k v>; later versions read an <Option> map. */
export function legacyProperties(target: QgisVersion): boolean {
  return target.major === 3 && target.minor < 18;
}

/** Read symbol-layer-style properties, preferring the <Option> map as QGIS does. */
export function readProperties(element: XmlElement): QgsVariantMap {
  const option = findChild(element, "Option");
  if (option?.attributes.type === "Map") {
    const value = readVariant(option);
    if (isMap(value)) return value;
  }
  return Object.fromEntries(
    findChildren(element, "prop").map((prop) => [
      prop.attributes.k ?? "",
      prop.attributes.v ?? "",
    ]),
  );
}

export function bindProperties(
  bind: Bind,
  element: XmlElement,
  path: string[],
): void {
  const option = findChild(element, "Option");
  if (option?.attributes.type === "Map") bindVariant(bind, option, path);
  else
    for (const prop of findChildren(element, "prop"))
      bind(prop, "v", [...path, prop.attributes.k ?? ""]);
}

export function writeProperties(
  element: XmlElement,
  properties: QgsVariantMap,
  target: QgisVersion,
): void {
  if (!isMap(properties))
    throw new QgsError("INVALID_EDIT", "Properties must be a plain object");
  const props = findChildren(element, "prop");
  if (legacyProperties(target)) {
    remove(element, "Option");
    replaceChildren(
      element,
      ["prop"],
      Object.entries(properties).map(([key, value]) => {
        const prop = structuredClone(
          props.find((item) => item.attributes.k === key) ??
            createElement("prop"),
        );
        prop.attributes.k = key;
        prop.attributes.v = scalarText(value, key);
        return prop;
      }),
    );
    return;
  }
  let option = findChild(element, "Option");
  // Nothing to store and nothing stored: leave the element as it is.
  if (!option && !props.length && !Object.keys(properties).length) return;
  if (!option) {
    option = createElement("Option", { type: "Map" });
    const first = props[0] ? element.children.indexOf(props[0]) : 0;
    element.children.splice(first, 0, option);
  }
  // Redundant <prop> copies written by QGIS 3.18-3.3x are normalized away.
  remove(element, "prop");
  writeVariantMap(option, properties, 0);
}
