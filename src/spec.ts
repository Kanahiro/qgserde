/**
 * Declarative element codecs. A spec lists where each model property lives in
 * an element; read, capture, restore and write are derived from it so the four
 * directions cannot disagree.
 */
import {
  boolean,
  ensure,
  number,
  putAttribute,
  putElementText,
  putText,
  readCrs,
  readExtent,
  remove,
  replaceChildren,
  writeCrs,
  writeExtent,
} from "./codec.ts";
import { QgsError } from "./errors.ts";
import type { ExtensionCodec } from "./extensions.ts";
import {
  bindDataDefined,
  captureSymbol,
  readDataDefined,
  readSymbol,
  restoreSymbol,
  writeDataDefined,
  writeSymbol,
} from "./symbology.ts";
import type { QgisVersion, QgsVariant, XmlElement } from "./types.ts";
import {
  type Bind,
  bindProperties,
  bindVariant,
  isMap,
  readProperties,
  readVariant,
  writeProperties,
  writeVariant,
} from "./variant.ts";
import { createElement, findChild, findChildren, getText } from "./xml.ts";

/** "boolean" is stored as 1/0 and "flag" as true/false. */
export type Scalar = "string" | "number" | "boolean" | "flag";

/** Kinds of an element's typed attributes, by attribute name. */
export type AttributeTable = Readonly<Record<string, Scalar>>;

/** Map field holding attributes a table does not type. */
export const OTHER = "other";

/**
 * Parse a typed attribute strictly; `undefined` means the raw value does not
 * have the expected form and is kept as a string instead.
 */
function parseTyped(raw: string, type: Scalar): unknown {
  if (type === "string") return raw;
  if (type === "number") {
    // Only plain decimal spellings; anything else QGIS might read differently.
    return /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/u.test(raw)
      ? Number(raw)
      : undefined;
  }
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return undefined;
}

/** Keep the stored spelling of an unchanged number and of booleans (1/0 or true/false). */
function typedText(
  value: unknown,
  type: Scalar,
  name: string,
  stored: string | undefined,
): string {
  const text = scalarText(value, type, name);
  if (
    type === "number" &&
    stored !== undefined &&
    parseTyped(stored, type) === value
  )
    return stored;
  if (type === "boolean" && (stored === "true" || stored === "false"))
    return value ? "true" : "false";
  if (type === "flag" && (stored === "1" || stored === "0"))
    return value ? "1" : "0";
  return text;
}

/** A number's stored spelling when it differs from the canonical one. */
function spelling(type: Scalar, raw: string | undefined): string | undefined {
  return type === "number" && raw !== undefined && String(Number(raw)) !== raw
    ? raw
    : undefined;
}

/** Extension format that restores a boolean in its stored spelling. */
function spelledAsFlag(
  type: Scalar,
  raw: string | undefined,
): "boolean" | undefined {
  if (type === "flag")
    return raw === "1" || raw === "0" ? undefined : "boolean";
  if (type === "boolean")
    return raw === "true" || raw === "false" ? "boolean" : undefined;
  return undefined;
}

/** Element path relative to the spec's element; empty means the element itself. */
type At = readonly string[];

export type Entry =
  /** One attribute as a typed scalar. `field` may be a path within the object. */
  | {
      kind: "attribute";
      field: string | readonly string[];
      attribute: string;
      type: Scalar;
      at?: At;
    }
  /** Every attribute not claimed by an "attribute" entry at the same path, as strings. */
  | {
      kind: "attributes";
      field: string;
      at?: At;
      exclude?: readonly string[];
      /** Typed attributes; the rest go to the map's `other` field. */
      table?: AttributeTable;
    }
  /** Text of every leaf child element of `at`, by element name. */
  | {
      kind: "texts";
      field: string;
      at: At;
      /** Typed child texts; the rest go to the map's `other` field. */
      table?: AttributeTable;
    }
  /** Fixed attribute written by the codec, such as a reference name. */
  | { kind: "constant"; attribute: string; value: string; at?: At }
  /** Text of the element at `at`. */
  | { kind: "text"; field: string; at: At; type: Scalar }
  /** Single sub-object stored inline; it shares the owner's extension data. */
  | { kind: "object"; field: string; at: At; spec: Spec }
  /** Separately owned element(s) of `spec.tag` under `at`; each keeps its own extension data. */
  | { kind: "owner" | "owners"; field: string; at?: At; spec: Spec }
  /** <Option> variant at `at` (the path ends with the Option element). */
  | { kind: "variant"; field: string; at: At }
  /** Symbol-layer-style properties (<prop> or an <Option> map) of the element at `at`. */
  | { kind: "properties"; field: string; at?: At }
  /** Data-defined property collection in the child element `tag` of `at`. */
  | { kind: "dataDefined"; field: string; tag: string; at?: At }
  /** <symbol> child identified by its name attribute. */
  | { kind: "symbol"; field: string; name: string; at?: At }
  /** Repeated `item` children of `at`, as strings from `attribute` or their text. */
  | { kind: "values"; field: string; at: At; item: string; attribute?: string }
  /**
   * Repeated `item` children of `at`, each as a string attribute map. With
   * `mirror`, later same-named copies of the container that QGIS also writes
   * are kept identical to the first, which QGIS reads.
   */
  | {
      kind: "records";
      field: string;
      at: At;
      item: string;
      mirror?: true;
      /** Map key for the item's own text, such as `url`. */
      text?: string;
      /** Read the item's leaf child elements instead of its attributes. */
      texts?: true;
      /** Typed attributes of each item; others go to the item's `other` map. */
      table?: AttributeTable;
    }
  /** CRS stored as `<tag><spatialrefsys>` under `at`; an empty tag means `at` itself. */
  | { kind: "crs"; field: string; tag: string; at?: At }
  /** Rectangle stored as `<tag>` under `at`, with coordinates as attributes or child text. */
  | { kind: "extent"; field: string; tag: string; at?: At }
  /**
   * Ordered owned children of several element names under `at`. Each item's
   * `kind` names its element through `specs`.
   */
  | { kind: "nodes"; field: string; at?: At; specs: Record<string, Spec> }
  /** Custom handling for structures that do not fit an entry above. */
  | { kind: "custom"; field: string; custom: Custom };

export interface Custom {
  read(element: XmlElement, codec: ExtensionCodec): unknown;
  capture(
    value: unknown,
    element: XmlElement,
    codec: ExtensionCodec,
    path: string[],
  ): void;
  restore(value: unknown, codec: ExtensionCodec, version: string): void;
  write(
    value: unknown,
    element: XmlElement,
    codec: ExtensionCodec,
    target: QgisVersion,
  ): void;
}

export interface Spec {
  tag: string;
  /** Other element names an owned object may come from, such as a root rule moved to a child. */
  aliases?: readonly string[];
  entries: readonly Entry[];
  /** Attributes identifying an owned element among same-named siblings. */
  slot?: readonly string[];
}

type Model = Record<string, unknown>;
const MAX_DEPTH = 128;

type RecordEntry = Extract<Entry, { kind: "records" }>;

function readRecord(entry: RecordEntry, item: XmlElement): Model {
  const record = readTyped(
    entry.texts
      ? leaves(item).map((child) => [child.name, getText(child)])
      : Object.entries(item.attributes),
    entry.table,
  );
  if (entry.text !== undefined && !findChildren(item).length)
    record[entry.text] = getText(item);
  return record;
}

/**
 * Attributes as a model map. With a table, typed attributes that parse become
 * values and every other attribute is kept as text in `other`.
 */
function readTyped(
  attributes: [string, string][],
  table: AttributeTable | undefined,
): Model {
  if (!table) return Object.fromEntries(attributes);
  const map: Model = {};
  const other: Record<string, string> = {};
  for (const [attribute, raw] of attributes) {
    const type = table[attribute];
    const value = type === undefined ? undefined : parseTyped(raw, type);
    if (value === undefined) other[attribute] = raw;
    else map[attribute] = value;
  }
  if (Object.keys(other).length) map[OTHER] = other;
  return map;
}

type Skip = { has(name: string): boolean };
const none: Skip = { has: () => false };

function captureTyped(
  element: XmlElement,
  table: AttributeTable | undefined,
  codec: ExtensionCodec,
  prefix: readonly string[],
  skip = none,
): void {
  for (const [attribute, raw] of Object.entries(element.attributes)) {
    if (skip.has(attribute)) continue;
    const type = table?.[attribute];
    if (!table) codec.bindAttribute(element, attribute, [...prefix, attribute]);
    else if (type !== undefined && parseTyped(raw, type) !== undefined)
      codec.bindAttribute(
        element,
        attribute,
        [...prefix, attribute],
        spelledAsFlag(type, raw),
        spelling(type, raw),
      );
    else codec.bindAttribute(element, attribute, [...prefix, OTHER, attribute]);
  }
}

function captureTexts(
  element: XmlElement,
  table: AttributeTable | undefined,
  codec: ExtensionCodec,
  prefix: readonly string[],
): void {
  for (const child of leaves(element)) {
    const raw = getText(child);
    const type = table?.[child.name];
    if (type !== undefined && parseTyped(raw, type) !== undefined)
      codec.bindText(
        element,
        child.name,
        [...prefix, child.name],
        spelledAsFlag(type, raw),
        spelling(type, raw),
      );
    else
      codec.bindText(
        element,
        child.name,
        table ? [...prefix, OTHER, child.name] : [...prefix, child.name],
      );
  }
}

/** Write a model map as leaf child elements, keeping the stored order. */
function writeTexts(
  element: XmlElement,
  value: unknown,
  table: AttributeTable | undefined,
  name: string,
): void {
  const stored = Object.fromEntries(
    leaves(element).map((child) => [child.name, getText(child)]),
  );
  const map = table
    ? typedMap(value, table, name, stored)
    : stringMap(value, name);
  for (const child of leaves(element))
    if (!Object.hasOwn(map, child.name)) remove(element, child.name);
  for (const [tag, item] of Object.entries(map)) putText(element, tag, item);
}

/** Write a model map's attributes in place, keeping the stored order. */
function writeTyped(
  element: XmlElement,
  value: unknown,
  table: AttributeTable | undefined,
  name: string,
  skip = none,
): void {
  const wanted = table
    ? typedMap(value, table, name, element.attributes)
    : stringMap(value, name);
  for (const attribute of Object.keys(element.attributes))
    if (!skip.has(attribute) && !Object.hasOwn(wanted, attribute))
      delete element.attributes[attribute];
  for (const [attribute, text] of Object.entries(wanted))
    if (!skip.has(attribute)) element.attributes[attribute] = text;
}

function typedMap(
  value: unknown,
  table: AttributeTable,
  name: string,
  stored: Record<string, string>,
): Record<string, string> {
  if (!isMap(value))
    throw new QgsError("INVALID_EDIT", `${name} must be an object`);
  const { [OTHER]: other, ...typed } = value;
  const wanted: Record<string, string> =
    other === undefined ? {} : stringMap(other, `${name}.${OTHER}`);
  for (const [attribute, item] of Object.entries(typed)) {
    const type = table[attribute];
    if (type === undefined)
      throw new QgsError(
        "INVALID_EDIT",
        `${name}.${attribute} is not a typed attribute; put it in ${OTHER}`,
      );
    if (item !== undefined)
      wanted[attribute] = typedText(
        item,
        type,
        `${name}.${attribute}`,
        stored[attribute],
      );
  }
  return wanted;
}

function writeRecord(
  entry: RecordEntry,
  child: XmlElement,
  record: Model,
  name: string,
): void {
  const { [entry.text ?? "\u0000"]: own, ...rest } = record;
  if (own !== undefined && typeof own !== "string")
    throw new QgsError(
      "INVALID_EDIT",
      `${name}.${entry.text} must be a string`,
    );
  if (entry.texts) writeTexts(child, rest, entry.table, name);
  else writeTyped(child, rest, entry.table, name);
  if (entry.text !== undefined) putElementText(child, own ?? "");
}

/** The element at `at` and same-named siblings after it. */
function copies(element: XmlElement, at: At): XmlElement[] {
  const parent = locate(element, at.slice(0, -1));
  const name = at.at(-1);
  return parent && name ? findChildren(parent, name) : [];
}

/** CRS helpers take a parent and a container name; `<spatialrefsys>` may sit directly in `at`. */
function crsHost(parent: XmlElement, tag: string): [XmlElement, string] {
  return tag
    ? [parent, tag]
    : [
        { type: "element", name: "", attributes: {}, children: [parent] },
        parent.name,
      ];
}

function nodeKind(specs: Record<string, Spec>, tag: string) {
  return Object.keys(specs).find((kind) => specs[kind]?.tag === tag);
}

function nodeSpec(specs: Record<string, Spec>, item: Model): Spec | undefined {
  return typeof item.kind === "string" && Object.hasOwn(specs, item.kind)
    ? specs[item.kind]
    : undefined;
}

/** Child elements without element children: scalar settings stored as text. */
const leaves = (element: XmlElement) =>
  findChildren(element).filter(
    (child) => !child.children.some((node) => node.type === "element"),
  );

function locate(element: XmlElement, at: At = []): XmlElement | undefined {
  let current: XmlElement | undefined = element;
  for (const tag of at) current = current && findChild(current, tag);
  return current;
}

function ensurePath(element: XmlElement, at: At = []): XmlElement {
  let current = element;
  for (const tag of at) current = ensure(current, tag);
  return current;
}

function removePath(element: XmlElement, at: At): void {
  const parent = locate(element, at.slice(0, -1));
  const last = at.at(-1);
  if (parent && last) remove(parent, last);
}

const fieldPath = (field: string | readonly string[]) =>
  typeof field === "string" ? [field] : [...field];

function getPath(model: Model, path: readonly string[]): unknown {
  let current: unknown = model;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Model)[key];
  }
  return current;
}

function setPath(model: Model, path: readonly string[], value: unknown): void {
  let current = model;
  for (const key of path.slice(0, -1)) {
    if (!isMap(current[key])) current[key] = {};
    current = current[key] as Model;
  }
  const last = path.at(-1);
  if (last !== undefined) current[last] = value;
}

function readScalar(raw: string, type: Scalar): unknown {
  if (type === "number") return number(raw);
  if (type === "boolean") return boolean(raw);
  if (type === "flag") return raw !== "false";
  return raw;
}

function scalarText(value: unknown, type: Scalar, name: string): string {
  const expected =
    type === "number" ? "number" : type === "string" ? "string" : "boolean";
  if (typeof value !== expected)
    throw new QgsError("INVALID_EDIT", `${name} must be a ${expected}`);
  if (type === "number" && !Number.isFinite(value))
    throw new QgsError("INVALID_EDIT", `${name} must be finite`);
  if (type === "flag") return value ? "true" : "false";
  if (type === "boolean") return value ? "1" : "0";
  return String(value);
}

const sameAt = (left: At = [], right: At = []) =>
  left.length === right.length && left.every((tag, i) => tag === right[i]);

/** Attributes an attribute map does not own: typed ones, exclusions, and namespace declarations. */
function claimed(
  spec: Spec,
  entry: Entry & { kind: "attributes" },
): { has(name: string): boolean } {
  const names = new Set([
    ...(entry.exclude ?? []),
    ...spec.entries.flatMap((other) =>
      other.kind === "attribute" && sameAt(other.at, entry.at)
        ? [other.attribute]
        : [],
    ),
  ]);
  return {
    has: (name) =>
      names.has(name) || name === "xmlns" || name.startsWith("xmlns:"),
  };
}

function stringMap(value: unknown, name: string): Record<string, string> {
  if (!isMap(value) || Object.values(value).some((v) => typeof v !== "string"))
    throw new QgsError(
      "INVALID_EDIT",
      `${name} must be an object of string values`,
    );
  return value as Record<string, string>;
}

const binder =
  (codec: ExtensionCodec): Bind =>
  (element, attribute, path, format) =>
    codec.bindAttribute(element, attribute, path, format);

// ---- read

export function readSpec(
  spec: Spec,
  element: XmlElement,
  codec: ExtensionCodec,
  depth = 0,
): Model {
  if (depth > MAX_DEPTH)
    throw new QgsError("INVALID_PROJECT", "Excessively deep project data");
  const model: Model = {};
  for (const entry of spec.entries) {
    if (entry.kind === "custom") {
      const value = entry.custom.read(element, codec);
      if (value !== undefined) model[entry.field] = value;
      continue;
    }
    if (entry.kind === "constant") continue;
    const target = locate(element, entry.at);
    if (!target) continue;
    switch (entry.kind) {
      case "crs": {
        const crs = readCrs(...crsHost(target, entry.tag));
        if (crs) model[entry.field] = crs;
        break;
      }
      case "extent": {
        const extent = readExtent(target, entry.tag);
        if (extent) model[entry.field] = extent;
        break;
      }
      case "nodes":
        model[entry.field] = findChildren(target).flatMap((child) => {
          const kind = nodeKind(entry.specs, child.name);
          if (kind === undefined) return [];
          const spec = entry.specs[kind] as Spec;
          const item = readSpec(spec, child, codec, depth + 1);
          return [codec.remember({ kind, ...item }, child)];
        });
        break;
      case "texts":
        model[entry.field] = readTyped(
          leaves(target).map((child) => [child.name, getText(child)]),
          entry.table,
        );
        break;
      case "attribute": {
        const raw = target.attributes[entry.attribute];
        if (raw === undefined) break;
        const value = readScalar(raw, entry.type);
        if (value !== undefined) setPath(model, fieldPath(entry.field), value);
        break;
      }
      case "attributes": {
        const skip = claimed(spec, entry);
        const map = readTyped(
          Object.entries(target.attributes).filter(([name]) => !skip.has(name)),
          entry.table,
        );
        // A child element's presence is meaningful; an empty map of the
        // element's own remaining attributes is not.
        if (entry.at?.length || Object.keys(map).length)
          model[entry.field] = map;
        break;
      }
      case "text": {
        const value = readScalar(getText(target), entry.type);
        if (value !== undefined) model[entry.field] = value;
        break;
      }
      case "object": {
        const value = readSpec(entry.spec, target, codec, depth + 1);
        // A sub-object sharing its parent element exists only through its settings.
        if (entry.at.length || Object.keys(value).length)
          model[entry.field] = value;
        break;
      }
      case "owner": {
        const child = findChild(target, entry.spec.tag);
        if (child)
          model[entry.field] = readOwned(entry.spec, child, codec, depth + 1);
        break;
      }
      case "owners":
        model[entry.field] = findChildren(target, entry.spec.tag).map((child) =>
          readOwned(entry.spec, child, codec, depth + 1),
        );
        break;
      case "variant":
        model[entry.field] = readVariant(target);
        break;
      case "properties":
        if (findChild(target, "Option") || findChild(target, "prop"))
          model[entry.field] = readProperties(target);
        break;
      case "dataDefined": {
        const value = readDataDefined(target, entry.tag);
        if (value) model[entry.field] = value;
        break;
      }
      case "symbol": {
        const symbol = findChildren(target, "symbol").find(
          (child) => child.attributes.name === entry.name,
        );
        if (symbol) model[entry.field] = readSymbol(symbol, codec);
        break;
      }
      case "values":
        model[entry.field] = findChildren(target, entry.item).map((item) =>
          entry.attribute === undefined
            ? getText(item)
            : (item.attributes[entry.attribute] ?? ""),
        );
        break;
      case "records":
        model[entry.field] = findChildren(target, entry.item).map((item) =>
          readRecord(entry, item),
        );
        break;
    }
  }
  return model;
}

export function readOwned(
  spec: Spec,
  element: XmlElement,
  codec: ExtensionCodec,
  depth = 0,
): Model {
  return codec.remember(readSpec(spec, element, codec, depth), element);
}

// ---- capture

export function captureSpec(
  spec: Spec,
  model: Model,
  element: XmlElement,
  codec: ExtensionCodec,
  path: string[],
): void {
  for (const entry of spec.entries) {
    if (entry.kind === "custom") {
      entry.custom.capture(model[entry.field], element, codec, [
        ...path,
        entry.field,
      ]);
      continue;
    }
    if (entry.kind === "constant") continue;
    const target = locate(element, entry.at);
    if (!target) continue;
    const at = [...path, ...fieldPath(entry.field)];
    const value = getPath(model, fieldPath(entry.field));
    switch (entry.kind) {
      case "crs":
        codec.bindCrs(...crsHost(target, entry.tag), at);
        break;
      case "extent":
        codec.bindExtent(target, entry.tag, at);
        break;
      case "nodes":
        if (Array.isArray(value))
          for (const item of value)
            if (isMap(item)) {
              const spec = nodeSpec(entry.specs, item);
              const child = codec.source(item);
              if (!spec || !child) continue;
              captureSpec(spec, item, child, codec, []);
              codec.own(item, child);
            }
        break;
      case "texts":
        if (target) captureTexts(target, entry.table, codec, at);
        break;
      case "attribute":
        codec.bindAttribute(
          target,
          entry.attribute,
          at,
          spelledAsFlag(entry.type, target?.attributes[entry.attribute]),
          spelling(entry.type, target?.attributes[entry.attribute]),
        );
        break;
      case "attributes":
        if (target)
          captureTyped(target, entry.table, codec, at, claimed(spec, entry));
        break;
      case "text": {
        const parent = locate(element, entry.at.slice(0, -1));
        codec.bindText(parent, entry.at.at(-1) ?? "", at);
        break;
      }
      case "object":
        if (isMap(value)) captureSpec(entry.spec, value, target, codec, at);
        break;
      case "owner":
        if (isMap(value)) captureOwned(entry.spec, value, codec);
        break;
      case "owners":
        if (Array.isArray(value))
          for (const item of value)
            if (isMap(item)) captureOwned(entry.spec, item, codec);
        break;
      case "variant":
        bindVariant(binder(codec), target, at);
        break;
      case "properties":
        bindProperties(binder(codec), target, at);
        break;
      case "dataDefined":
        bindDataDefined(codec, target, entry.tag, at);
        break;
      case "symbol":
        if (isMap(value))
          captureSymbol(value as never, codec, { name: entry.name });
        break;
      case "values":
        for (const [index, item] of findChildren(target, entry.item).entries())
          if (entry.attribute === undefined)
            codec.bindText(target, entry.item, [...at, String(index)]);
          else
            codec.bindAttribute(item, entry.attribute, [...at, String(index)]);
        break;
      case "records":
        for (const host of entry.mirror ? copies(element, entry.at) : [target])
          for (const [index, item] of findChildren(
            host,
            entry.item,
          ).entries()) {
            const prefix = [...at, String(index)];
            if (entry.texts) captureTexts(item, entry.table, codec, prefix);
            else captureTyped(item, entry.table, codec, prefix);
            if (entry.text !== undefined)
              codec.bindElementText(item, [...prefix, entry.text]);
          }
        break;
    }
  }
}

export function captureOwned(
  spec: Spec,
  model: Model,
  codec: ExtensionCodec,
): void {
  const element = codec.source(model);
  if (!element) return;
  captureSpec(spec, model, element, codec, []);
  const slot = spec.slot?.length
    ? Object.fromEntries(
        spec.slot.flatMap((name) => {
          const value = element.attributes[name];
          return value === undefined ? [] : [[name, value]];
        }),
      )
    : undefined;
  codec.own(model, element, slot);
}

// ---- restore

export function restoreSpec(
  spec: Spec,
  model: Model,
  codec: ExtensionCodec,
  version: string,
  depth: number,
): void {
  if (depth > MAX_DEPTH)
    throw new QgsError("INVALID_EDIT", "Cyclic or excessively deep model");
  for (const entry of spec.entries) {
    if (entry.kind === "constant") continue;
    const value = getPath(model, fieldPath(entry.field));
    switch (entry.kind) {
      case "custom":
        entry.custom.restore(value, codec, version);
        break;
      case "object":
        if (isMap(value))
          restoreSpec(entry.spec, value, codec, version, depth + 1);
        break;
      case "owner":
        if (isMap(value))
          restoreOwned(entry.spec, value, codec, version, depth + 1);
        break;
      case "owners":
        if (Array.isArray(value))
          for (const item of value)
            if (isMap(item))
              restoreOwned(entry.spec, item, codec, version, depth + 1);
        break;
      case "nodes":
        if (Array.isArray(value))
          for (const item of value) {
            const spec = isMap(item) && nodeSpec(entry.specs, item);
            if (spec)
              restoreOwned(spec, item as Model, codec, version, depth + 1);
          }
        break;
      case "symbol":
        if (isMap(value)) restoreSymbol(value as never, codec, version);
        break;
    }
  }
}

export function restoreOwned(
  spec: Spec,
  model: Model,
  codec: ExtensionCodec,
  version: string,
  depth = 0,
): void {
  restoreSpec(spec, model, codec, version, depth);
  const stored = (
    model.extensions as { layout?: { name?: string } } | undefined
  )?.layout?.name;
  codec.restoreOwner(
    model,
    version,
    stored && spec.aliases?.includes(stored) ? stored : spec.tag,
  );
}

// ---- write

export function writeSpec(
  spec: Spec,
  model: Model,
  element: XmlElement,
  codec: ExtensionCodec,
  target: QgisVersion,
  depth = 0,
): void {
  if (depth > MAX_DEPTH)
    throw new QgsError("INVALID_EDIT", "Cyclic or excessively deep model");
  if (!isMap(model))
    throw new QgsError(
      "INVALID_EDIT",
      `${spec.tag} settings must be an object`,
    );
  for (const entry of spec.entries) {
    if (entry.kind === "custom") {
      entry.custom.write(model[entry.field], element, codec, target);
      continue;
    }
    if (entry.kind === "constant") {
      ensurePath(element, entry.at).attributes[entry.attribute] = entry.value;
      continue;
    }
    const name = fieldPath(entry.field).join(".");
    const value = getPath(model, fieldPath(entry.field));
    const existing = locate(element, entry.at);
    if (value === undefined && !existing) continue;
    // Removing a list kept in a container removes its items, and the container
    // once nothing else is left in it, so the model reads back unchanged.
    if (
      value === undefined &&
      existing &&
      (entry.kind === "owners" ||
        entry.kind === "values" ||
        entry.kind === "records") &&
      entry.at?.length
    ) {
      const item = "spec" in entry ? entry.spec.tag : entry.item;
      remove(existing, item);
      if (
        !findChildren(existing).length &&
        !Object.keys(existing.attributes).length
      )
        removePath(element, entry.at);
      continue;
    }
    switch (entry.kind) {
      case "crs":
        writeCrs(
          ...crsHost(existing ?? ensurePath(element, entry.at), entry.tag),
          value as never,
        );
        break;
      case "extent":
        writeExtent(
          existing ?? ensurePath(element, entry.at),
          value as never,
          entry.tag,
        );
        break;
      case "nodes": {
        if (value !== undefined && !Array.isArray(value))
          throw new QgsError("INVALID_EDIT", `${name} must be an array`);
        const host = existing ?? ensurePath(element, entry.at);
        const tags = Object.values(entry.specs).map((spec) => spec.tag);
        replaceChildren(
          host,
          tags,
          ((value ?? []) as unknown[]).map((item) => {
            const spec = isMap(item) ? nodeSpec(entry.specs, item) : undefined;
            if (!spec || !isMap(item))
              throw new QgsError(
                "INVALID_EDIT",
                `${name} items require a known kind`,
              );
            return writeOwned(spec, item, codec, target, depth + 1);
          }),
        );
        break;
      }
      case "texts": {
        if (value === undefined) {
          removePath(element, entry.at);
          break;
        }
        writeTexts(
          existing ?? ensurePath(element, entry.at),
          value,
          entry.table,
          name,
        );
        break;
      }
      case "attribute": {
        const host = existing ?? ensurePath(element, entry.at);
        if (value === undefined) delete host.attributes[entry.attribute];
        else
          putAttribute(
            host,
            entry.attribute,
            typedText(
              value,
              entry.type,
              name,
              host.attributes[entry.attribute],
            ),
          );
        break;
      }
      case "attributes": {
        if (value === undefined && entry.at?.length) {
          removePath(element, entry.at);
          break;
        }
        writeTyped(
          existing ?? ensurePath(element, entry.at),
          value ?? {},
          entry.table,
          name,
          claimed(spec, entry),
        );
        break;
      }
      case "text": {
        const parent = ensurePath(element, entry.at.slice(0, -1));
        putText(
          parent,
          entry.at.at(-1) ?? "",
          value === undefined ? undefined : scalarText(value, entry.type, name),
        );
        break;
      }
      case "object":
        if (value === undefined && !entry.at.length)
          writeSpec(entry.spec, {}, element, codec, target, depth + 1);
        else if (value === undefined) removePath(element, entry.at);
        else
          writeSpec(
            entry.spec,
            value as Model,
            existing ?? ensurePath(element, entry.at),
            codec,
            target,
            depth + 1,
          );
        break;
      case "owner": {
        const host = existing ?? ensurePath(element, entry.at);
        replaceChildren(
          host,
          [entry.spec.tag],
          value === undefined
            ? []
            : [
                writeOwned(
                  entry.spec,
                  value as Model,
                  codec,
                  target,
                  depth + 1,
                ),
              ],
        );
        break;
      }
      case "owners": {
        if (value !== undefined && !Array.isArray(value))
          throw new QgsError("INVALID_EDIT", `${name} must be an array`);
        const host = existing ?? ensurePath(element, entry.at);
        replaceChildren(
          host,
          [entry.spec.tag],
          (value ?? []).map((item: Model) =>
            writeOwned(entry.spec, item, codec, target, depth + 1),
          ),
        );
        break;
      }
      case "variant":
        if (value === undefined) removePath(element, entry.at);
        else
          writeVariant(
            existing ?? ensurePath(element, entry.at),
            value as QgsVariant,
          );
        break;
      case "properties": {
        const host = existing ?? ensurePath(element, entry.at);
        if (
          value === undefined &&
          !findChild(host, "Option") &&
          !findChild(host, "prop")
        )
          break;
        writeProperties(host, (value ?? {}) as never, target);
        break;
      }
      case "dataDefined":
        writeDataDefined(
          existing ?? ensurePath(element, entry.at),
          value as never,
          entry.tag,
        );
        break;
      case "symbol": {
        const host = existing ?? ensurePath(element, entry.at);
        const index = host.children.findIndex(
          (child) =>
            child.type === "element" &&
            child.name === "symbol" &&
            child.attributes.name === entry.name,
        );
        if (value === undefined) {
          if (index >= 0) host.children.splice(index, 1);
          break;
        }
        const symbol = writeSymbol(value as never, entry.name, codec, target);
        if (index >= 0) host.children[index] = symbol;
        else host.children.push(symbol);
        break;
      }
      case "values":
      case "records": {
        if (value !== undefined && !Array.isArray(value))
          throw new QgsError("INVALID_EDIT", `${name} must be an array`);
        const host = existing ?? ensurePath(element, entry.at);
        const hosts =
          entry.kind === "records" && entry.mirror
            ? copies(element, entry.at)
            : [host];
        for (const copy of hosts) {
          const items = findChildren(copy, entry.item);
          replaceChildren(
            copy,
            [entry.item],
            ((value ?? []) as unknown[]).map((item, index) => {
              const child = structuredClone(
                items[index] ?? createElement(entry.item),
              );
              if (entry.kind === "records")
                if (!isMap(item))
                  throw new QgsError(
                    "INVALID_EDIT",
                    `${name} must hold objects`,
                  );
                else writeRecord(entry, child, item as Model, name);
              else if (typeof item !== "string")
                throw new QgsError("INVALID_EDIT", `${name} must hold strings`);
              else if (entry.attribute === undefined)
                putElementText(child, item);
              else child.attributes[entry.attribute] = item;
              return child;
            }),
          );
        }
        break;
      }
    }
  }
}

export function writeOwned(
  spec: Spec,
  model: Model,
  codec: ExtensionCodec,
  target: QgisVersion,
  depth = 0,
): XmlElement {
  if (!isMap(model))
    throw new QgsError("INVALID_EDIT", `${spec.tag} must be an object`);
  const element = structuredClone(
    codec.source(model) ?? createElement(spec.tag),
  );
  element.name = spec.tag;
  writeSpec(spec, model, element, codec, target, depth);
  return element;
}

/**
 * A single owned child element whose spec depends on its `type` attribute.
 * Unrecognized types read as `{ type: "unknown", xmlType }` and keep their
 * settings in extension data.
 */
export function union(tag: string, specs: Record<string, Spec>): Custom {
  const unknown: Spec = {
    tag,
    entries: [
      {
        kind: "attribute",
        field: "xmlType",
        attribute: "type",
        type: "string",
      },
    ],
  };
  const specFor = (model: Model): Spec => {
    if (model.type === "unknown") return unknown;
    const spec =
      typeof model.type === "string" && Object.hasOwn(specs, model.type)
        ? specs[model.type]
        : undefined;
    if (!spec)
      throw new QgsError(
        "INVALID_EDIT",
        `Unknown ${tag} type: ${String(model.type)}`,
      );
    return spec;
  };
  return {
    read(element, codec) {
      const child = findChild(element, tag);
      if (!child) return undefined;
      const type = child.attributes.type ?? "";
      const spec = Object.hasOwn(specs, type) ? specs[type] : undefined;
      if (spec) return readOwned(spec, child, codec);
      const model = readSpec(unknown, child, codec);
      model.type = "unknown";
      return codec.remember(model, child);
    },
    capture(value, _element, codec) {
      if (isMap(value)) captureOwned(specFor(value), value, codec);
    },
    restore(value, codec, version) {
      if (isMap(value)) restoreOwned(specFor(value), value, codec, version);
    },
    write(value, element, codec, target) {
      if (value !== undefined && !isMap(value))
        throw new QgsError("INVALID_EDIT", `${tag} must be an object`);
      replaceChildren(
        element,
        [tag],
        value === undefined
          ? []
          : [writeOwned(specFor(value), value, codec, target)],
      );
    },
  };
}
