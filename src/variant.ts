import { remove, replaceChildren } from "./codec.ts";
import { QgsError } from "./errors.ts";
import type {
  QgisVersion,
  QgsTypedVariant,
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

/** A variant whose Qt type the plain value does not imply; see {@link QgsTypedVariant}. */
export const TYPE = "@type";

const known = (type: string) =>
  type === "" ||
  type === "invalid" ||
  type === "Map" ||
  type === "List" ||
  type === "StringList" ||
  type === "bool" ||
  numeric.has(type) ||
  textual.has(type) ||
  wrappers.has(type);

export function isTyped(value: unknown): value is QgsTypedVariant {
  return (
    isMap(value) &&
    typeof value[TYPE] === "string" &&
    Object.keys(value).every(
      (key) => key === TYPE || key === "value" || key === "xml",
    )
  );
}

/** The Qt type QGIS writes for a plain value; it omits the type of an empty map. */
function defaultType(value: QgsVariant): string {
  if (value === null) return "invalid";
  if (Array.isArray(value)) return "List";
  if (typeof value === "string") return "QString";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number")
    return !Number.isInteger(value)
      ? "double"
      : Math.abs(value) <= 2147483647
        ? "int"
        : "qlonglong";
  return Object.keys(value).length ? "Map" : "";
}

function decode(element: XmlElement, depth: number): QgsVariant {
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
  // QGIS writes an empty map without a type; it reads that as invalid.
  return type === "" ? {} : null;
}

/**
 * Decode an <Option> element. A value is plain when its Qt type is the one QGIS
 * writes for it; otherwise it is tagged with its type, and a type qgserde does
 * not decode, such as a CRS, keeps its XML.
 */
export function readVariant(element: XmlElement, depth = 0): QgsVariant {
  deep(depth, "INVALID_PROJECT");
  const type = element.attributes.type ?? "";
  if (!known(type))
    return {
      [TYPE]: type,
      xml: findChildren(element).map((child) => structuredClone(child)),
    };
  const value = decode(element, depth);
  // A map that looks like a tagged value is tagged as a map.
  if (type === defaultType(value) && !isTyped(value)) return value;
  return { [TYPE]: type, value };
}

export function bindVariant(
  bind: Bind,
  element: XmlElement,
  path: string[],
  depth = 0,
): void {
  if (depth > MAX_DEPTH) return;
  const type = element.attributes.type ?? "";
  if (!known(type)) return;
  if (isTyped(readVariant(element, depth))) path = [...path, "value"];
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

export function numberText(value: number): string {
  return Number.isInteger(value) ? BigInt(value).toString() : String(value);
}

function mismatch(type: string): never {
  throw new QgsError("INVALID_EDIT", `Variant value does not fit type ${type}`);
}

/** Write a value into an <Option> element, keeping matching nested children. */
export function writeVariant(
  element: XmlElement,
  value: QgsVariant,
  depth = 0,
): void {
  deep(depth, "INVALID_EDIT");
  if (isTyped(value)) {
    const type = value[TYPE];
    if (!known(type)) {
      if (!Array.isArray(value.xml)) mismatch(type);
      element.attributes.type = type;
      delete element.attributes.value;
      element.children = value.xml.map((child) => structuredClone(child));
      return;
    }
    writeAs(element, type, value.value ?? null, depth);
    return;
  }
  writeAs(element, defaultType(value), value, depth);
}

function writeAs(
  element: XmlElement,
  type: string,
  value: QgsVariant,
  depth: number,
): void {
  if (type) element.attributes.type = type;
  else delete element.attributes.type;
  delete element.attributes.value;
  if (type === "invalid") {
    if (value !== null) mismatch(type);
    remove(element, "Option");
  } else if (type === "") {
    if (!isMap(value) || Object.keys(value).length) mismatch(type);
    remove(element, "Option");
  } else if (type === "List" || type === "StringList") {
    if (!Array.isArray(value)) mismatch(type);
    if (type === "StringList" && value.some((item) => typeof item !== "string"))
      mismatch(type);
    const existing = options(element);
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
  } else if (type === "Map") {
    if (!isMap(value)) mismatch(type);
    writeVariantMap(element, value, depth);
  } else if (wrappers.has(type)) {
    const inner = options(element)[0] ?? createElement("Option");
    writeVariant(inner, value, depth + 1);
    replaceChildren(element, ["Option"], [inner]);
  } else {
    remove(element, "Option");
    if (type === "bool") {
      if (typeof value !== "boolean") mismatch(type);
      element.attributes.value = value ? "true" : "false";
    } else if (numeric.has(type)) {
      if (typeof value !== "number" || !Number.isFinite(value)) mismatch(type);
      if (integral.has(type) && !Number.isInteger(value)) mismatch(type);
      element.attributes.value = numberText(value);
    } else {
      if (typeof value !== "string") mismatch(type);
      element.attributes.value = value;
    }
  }
}

/** QGIS stores maps sorted by key (`QMap`). */
function writeVariantMap(
  element: XmlElement,
  value: QgsVariantMap,
  depth: number,
): void {
  const existing = options(element);
  const used = new Set<XmlElement>();
  replaceChildren(
    element,
    ["Option"],
    Object.entries(value)
      .sort(([a], [b]) => Number(a > b) - Number(a < b))
      .map(([key, item]) => {
        const child =
          existing.find(
            (option) => !used.has(option) && option.attributes.name === key,
          ) ?? createElement("Option", { name: key });
        used.add(child);
        writeVariant(child, item, depth + 1);
        return child;
      }),
  );
}

function scalarText(value: QgsVariant, key: string): string {
  if (isTyped(value)) return scalarText(value.value ?? null, key);
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
