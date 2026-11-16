/**
 * Project property tree (`<properties>`): nested keys with typed values, stored
 * as `<Key type="…">` (QGIS 3) or `<properties name="Key" type="…">` (QGIS 4).
 */
import { putElementText, replaceChildren } from "./codec.ts";
import { QgsError } from "./errors.ts";
import type { ExtensionCodec } from "./extensions.ts";
import type { Custom } from "./spec.ts";
import type {
  QgsProjectProperties,
  QgsProjectPropertyValue,
  XmlElement,
} from "./types.ts";
import { isMap, numberText } from "./variant.ts";
import { createElement, findChild, findChildren, getText } from "./xml.ts";

const numeric = new Set(["int", "uint", "qlonglong", "qulonglong", "double"]);
const integral = new Set(["int", "uint", "qlonglong", "qulonglong"]);
const MAX_DEPTH = 64;

// SpatialRefSys/ProjectionsEnabled is owned by project.crs.
const managed = (path: string[], key: string) =>
  path.length === 1 &&
  path[0] === "SpatialRefSys" &&
  key === "ProjectionsEnabled";

const isNamed = (element: XmlElement) =>
  element.name === "properties" && element.attributes.name !== undefined;
const keyOf = (element: XmlElement) =>
  isNamed(element) ? (element.attributes.name ?? "") : element.name;

/** Children per key; a named entry wins over the element-name form, as in QGIS 4. */
function entries(element: XmlElement): Map<string, XmlElement[]> {
  const result = new Map<string, XmlElement[]>();
  for (const child of findChildren(element)) {
    const key = keyOf(child);
    const list = result.get(key) ?? [];
    if (isNamed(child)) list.unshift(child);
    else list.push(child);
    result.set(key, list);
  }
  return result;
}

function readValue(element: XmlElement): QgsProjectPropertyValue {
  const type = element.attributes.type ?? "";
  const text = getText(element);
  if (type === "QStringList")
    return findChildren(element, "value").map(getText);
  if (type === "bool") return !/^(?:0|false|)$/iu.test(text.trim());
  if (numeric.has(type)) {
    if (text.trim() === "") return 0;
    const value = Number(text);
    if (!Number.isFinite(value))
      throw new QgsError(
        "INVALID_PROJECT",
        `Expected a finite ${type} project property, received ${text}`,
      );
    return value;
  }
  return text;
}

function readKey(
  element: XmlElement,
  path: string[],
  depth: number,
): QgsProjectProperties {
  if (depth > MAX_DEPTH)
    throw new QgsError(
      "INVALID_PROJECT",
      "Excessively deep project properties",
    );
  const result: QgsProjectProperties = {};
  for (const [key, [first]] of entries(element)) {
    if (!first || managed(path, key)) continue;
    // `Object.defineProperty` keeps keys such as "__proto__" as own data.
    Object.defineProperty(result, key, {
      value:
        first.attributes.type === undefined
          ? readKey(first, [...path, key], depth + 1)
          : readValue(first),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

function bindKey(
  codec: ExtensionCodec,
  element: XmlElement,
  path: string[],
  depth: number,
): void {
  if (depth > MAX_DEPTH) return;
  for (const [key, list] of entries(element)) {
    if (managed(path.slice(1), key)) continue;
    for (const child of list) {
      const at = [...path, key];
      if (child.attributes.type === undefined)
        bindKey(codec, child, at, depth + 1);
      else if (child.attributes.type === "QStringList")
        for (const [index, item] of findChildren(child, "value").entries())
          codec.bindElementText(item, [...at, String(index)]);
      else codec.bindElementText(child, at);
    }
  }
}

function writeValue(element: XmlElement, value: unknown, name: string): void {
  const type = element.attributes.type ?? "";
  if (Array.isArray(value)) {
    if (!value.every((item) => typeof item === "string"))
      throw new QgsError("INVALID_EDIT", `${name} must hold strings`);
    // A scalar that becomes a list drops its text; list whitespace stays.
    if (type !== "QStringList")
      element.children = element.children.filter(
        (node) => node.type !== "text" && node.type !== "cdata",
      );
    element.attributes.type = "QStringList";
    const items = findChildren(element, "value");
    replaceChildren(
      element,
      ["value"],
      value.map((item, index) => {
        const child = structuredClone(items[index] ?? createElement("value"));
        putElementText(child, item);
        return child;
      }),
    );
    return;
  }
  element.children = element.children.filter((node) => node.type !== "element");
  if (typeof value === "string") {
    element.attributes.type =
      type && type !== "QStringList" && type !== "bool" && !numeric.has(type)
        ? type
        : "QString";
    putElementText(element, value);
  } else if (typeof value === "boolean") {
    element.attributes.type = "bool";
    putElementText(element, value ? "true" : "false");
  } else if (typeof value === "number" && Number.isFinite(value)) {
    const integer = Number.isInteger(value);
    element.attributes.type =
      numeric.has(type) &&
      (!integral.has(type) || (integer && !(type.startsWith("u") && value < 0)))
        ? type
        : integer
          ? "int"
          : "double";
    putElementText(element, numberText(value));
  } else
    throw new QgsError(
      "INVALID_EDIT",
      `${name} must be a string, finite number, boolean, string array, or object`,
    );
}

function writeKey(
  element: XmlElement,
  tree: QgsProjectProperties,
  path: string[],
  depth: number,
): void {
  if (depth > MAX_DEPTH)
    throw new QgsError("INVALID_EDIT", "Cyclic or excessively deep properties");
  if (!isMap(tree))
    throw new QgsError(
      "INVALID_EDIT",
      `Project property ${path.join("/") || "tree"} must be a plain object`,
    );
  const named = isNamed(element) || findChildren(element).some(isNamed);
  const existing = entries(element);
  const keep = new Set<XmlElement>();
  for (const [key, value] of Object.entries(tree)) {
    if (managed(path, key)) continue;
    const list = existing.get(key) ?? [];
    if (!list.length) {
      const child = named
        ? createElement("properties", { name: key })
        : createElement(key);
      element.children.push(child);
      list.push(child);
    }
    const name = [...path, key].join("/");
    for (const child of list) {
      keep.add(child);
      if (isMap(value)) {
        // A value that becomes a key drops its text and list items.
        if (child.attributes.type !== undefined) {
          delete child.attributes.type;
          child.children = child.children.filter(
            (node) => node.type === "comment",
          );
        }
        writeKey(child, value, [...path, key], depth + 1);
      } else writeValue(child, value, name);
    }
  }
  element.children = element.children.filter(
    (node) =>
      node.type !== "element" ||
      keep.has(node) ||
      managed(path, keyOf(node)) ||
      (path.length === 0 && keyOf(node) === "SpatialRefSys"),
  );
  // Managed entries live under SpatialRefSys; keep that key for them.
  const spatial = existing.get("SpatialRefSys");
  if (path.length === 0 && !Object.hasOwn(tree, "SpatialRefSys") && spatial)
    for (const child of spatial)
      child.children = child.children.filter(
        (node) =>
          node.type !== "element" || managed(["SpatialRefSys"], keyOf(node)),
      );
}

/** The project `<properties>` tree. */
export const projectProperties: Custom = {
  read(root) {
    const properties = findChild(root, "properties");
    if (!properties) return undefined;
    const tree = readKey(properties, [], 0);
    // SpatialRefSys holding only the managed key is not a user setting.
    const spatial = tree.SpatialRefSys;
    if (isMap(spatial) && !Object.keys(spatial).length)
      delete tree.SpatialRefSys;
    return Object.keys(tree).length ? tree : undefined;
  },
  capture(_value, root, codec, path) {
    const properties = findChild(root, "properties");
    if (properties) bindKey(codec, properties, path, 0);
  },
  restore() {},
  write(value, root) {
    const properties = findChild(root, "properties");
    if (!properties && value === undefined) return;
    writeKey(
      properties ??
        (root.children.push(createElement("properties")),
        findChild(root, "properties") as XmlElement),
      (value ?? {}) as QgsProjectProperties,
      [],
      0,
    );
  },
};
