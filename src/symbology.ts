import {
  classificationExtraAttributes,
  classificationLabelFormatAttributes,
  fontAttributes,
  heatmapRendererAttributes,
  invertedPolygonRendererAttributes,
  orderByClauseAttributes,
  pointClusterRendererAttributes,
  pointDisplacementRendererAttributes,
  sizeLegendAttributes,
  sizeLegendClassAttributes,
  sizeLegendFontAttributes,
  sizeLegendTextStyleAttributes,
  symmetricModeAttributes,
} from "./attributes.generated.ts";
import {
  boolean,
  ensure,
  number,
  putAttribute,
  remove,
  replaceChildren,
} from "./codec.ts";
import { QgsError } from "./errors.ts";
import type { ExtensionCodec } from "./extensions.ts";
import { colorRampSpec } from "./raster.ts";
import {
  type AttributeTable,
  type Custom,
  captureSpec,
  type Entry,
  readSpec,
  restoreSpec,
  type Spec,
  writeSpec,
} from "./spec.ts";
import type {
  QgisVersion,
  QgsCategoryValue,
  QgsColorRamp,
  QgsDataDefinedProperties,
  QgsRendererCategory,
  QgsRendererRange,
  QgsRendererRule,
  QgsSymbol,
  QgsSymbolLayer,
  QgsSymbolType,
  QgsVariantMap,
  QgsVectorRenderer,
  XmlElement,
} from "./types.ts";
import {
  type Bind,
  bindProperties,
  bindVariant,
  isMap,
  numberText,
  readProperties,
  readVariant,
  writeProperties,
  writeVariant,
} from "./variant.ts";
import { createElement, findChild, findChildren } from "./xml.ts";

const MAX_DEPTH = 128;

// "boolean" is stored as 1/0 and "flag" as true/false, matching QGIS writers.
type Kind = "string" | "number" | "boolean" | "flag";
type Attributes = readonly (readonly [string, string, Kind])[];

const symbolAttributes: Attributes = [
  ["opacity", "alpha", "number"],
  ["clipToExtent", "clip_to_extent", "boolean"],
  ["forceRightHandRule", "force_rhr", "boolean"],
  ["extentBuffer", "extent_buffer", "number"],
  ["extentBufferUnit", "extent_buffer_unit", "string"],
  ["animated", "is_animated", "boolean"],
  ["frameRate", "frame_rate", "number"],
  ["rendererShouldUseSymbolLevels", "renderer_should_use_levels", "boolean"],
];
const symbolLayerAttributes: Attributes = [
  ["enabled", "enabled", "boolean"],
  ["locked", "locked", "boolean"],
  ["pass", "pass", "number"],
  ["id", "id", "string"],
  ["userFlags", "userFlags", "string"],
];
const rendererAttributes: Attributes = [
  ["symbolLevels", "symbollevels", "boolean"],
  ["forceRaster", "forceraster", "boolean"],
  ["referenceScale", "referencescale", "number"],
  ["orderByEnabled", "enableorderby", "boolean"],
];
const classAttributes: Attributes = [
  ["label", "label", "string"],
  ["render", "render", "flag"],
  ["uuid", "uuid", "string"],
];
const rangeAttributes: Attributes = [
  ["lower", "lower", "number"],
  ["upper", "upper", "number"],
  ...classAttributes,
];
const ruleAttributes: Attributes = [
  ["filter", "filter", "string"],
  ["label", "label", "string"],
  ["description", "description", "string"],
  ["minScaleDenominator", "scalemindenom", "number"],
  ["maxScaleDenominator", "scalemaxdenom", "number"],
  ["active", "checkstate", "boolean"],
  ["key", "key", "string"],
];
const symbolTypes = new Set<string>(["marker", "line", "fill"]);
const DATA_DEFINED = "data_defined_properties";

function readAttributes(
  target: object,
  element: XmlElement,
  table: Attributes,
): void {
  const record = target as Record<string, unknown>;
  for (const [field, attribute, kind] of table) {
    const raw = element.attributes[attribute];
    if (raw === undefined) continue;
    const value =
      kind === "number"
        ? number(raw)
        : kind === "boolean"
          ? boolean(raw)
          : kind === "flag"
            ? raw !== "false"
            : raw;
    if (value !== undefined) record[field] = value;
  }
}

function writeAttributes(
  element: XmlElement,
  source: object,
  table: Attributes,
): void {
  const record = source as Record<string, unknown>;
  for (const [field, attribute, kind] of table) {
    const value = record[field];
    if (value === undefined) {
      delete element.attributes[attribute];
      continue;
    }
    const expected =
      kind === "number" ? "number" : kind === "string" ? "string" : "boolean";
    if (typeof value !== expected)
      throw new QgsError("INVALID_EDIT", `${field} must be a ${expected}`);
    putAttribute(
      element,
      attribute,
      kind === "flag" ? (value ? "true" : "false") : (value as string),
    );
  }
}

function bindAttributes(
  codec: ExtensionCodec,
  element: XmlElement,
  table: Attributes,
): void {
  for (const [field, attribute, kind] of table)
    codec.bindAttribute(
      element,
      attribute,
      [field],
      kind === "flag" ? "boolean" : undefined,
    );
}

const binder =
  (codec: ExtensionCodec): Bind =>
  (element, attribute, path, format) =>
    codec.bindAttribute(element, attribute, path, format);

function dataDefinedEntry(
  parent: XmlElement,
  tag: string,
): XmlElement | undefined {
  const container = findChild(parent, tag);
  const root = container && findChild(container, "Option");
  return root
    ? findChildren(root, "Option").find(
        (option) => option.attributes.name === "properties",
      )
    : undefined;
}

export function readDataDefined(
  parent: XmlElement,
  tag = DATA_DEFINED,
): QgsDataDefinedProperties | undefined {
  const entry = dataDefinedEntry(parent, tag);
  const value = entry && readVariant(entry);
  return isMap(value) && Object.keys(value).length
    ? (value as QgsDataDefinedProperties)
    : undefined;
}

export function bindDataDefined(
  codec: ExtensionCodec,
  parent: XmlElement,
  tag = DATA_DEFINED,
  path = ["dataDefinedProperties"],
): void {
  const entry = dataDefinedEntry(parent, tag);
  if (entry) bindVariant(binder(codec), entry, path);
}

/** Missing and empty property collections are equivalent; QGIS stores both as an empty map. */
export function writeDataDefined(
  parent: XmlElement,
  properties: QgsDataDefinedProperties | undefined,
  tag = DATA_DEFINED,
): void {
  const value = properties ?? {};
  if (!isMap(value))
    throw new QgsError(
      "INVALID_EDIT",
      "Data-defined properties must be a plain object",
    );
  let container = findChild(parent, tag);
  if (!container) {
    if (!Object.keys(value).length) return;
    container = createElement(tag);
    parent.children.push(container);
  }
  let root = findChild(container, "Option");
  if (!root) {
    root = createElement("Option", { type: "Map" }, [
      createElement("Option", { name: "name", type: "QString", value: "" }),
      createElement("Option", { name: "properties" }),
      createElement("Option", {
        name: "type",
        type: "QString",
        value: "collection",
      }),
    ]);
    container.children.push(root);
  }
  root.attributes.type = "Map";
  let entry = findChildren(root, "Option").find(
    (option) => option.attributes.name === "properties",
  );
  if (!entry) {
    entry = createElement("Option", { name: "properties" });
    root.children.push(entry);
  }
  writeVariant(entry, value as QgsVariantMap);
}

function depthGuard(depth: number, code: "INVALID_PROJECT" | "INVALID_EDIT") {
  if (depth > MAX_DEPTH)
    throw new QgsError(code, "Cyclic or excessively deep symbology");
}

// ---- spec-described extras

const effectEntries: Entry[] = [
  { kind: "attribute", field: "type", attribute: "type", type: "string" },
  {
    kind: "attribute",
    field: "enabled",
    attribute: "enabled",
    type: "boolean",
  },
  { kind: "properties", field: "properties" },
];
export const effectSpec: Spec = { tag: "effect", entries: effectEntries };
effectEntries.push({ kind: "owners", field: "effects", spec: effectSpec });
const effect: Entry = {
  kind: "object",
  field: "effect",
  at: ["effect"],
  spec: effectSpec,
};

const layerExtras: Spec = { tag: "layer", entries: [effect] };

/** Embedded `<renderer-v2>` of wrapper renderers such as point clusters. */
export const nestedRenderer: Custom = {
  read(element, codec) {
    const child = findChild(element, "renderer-v2");
    return child && readRenderer(child, codec);
  },
  capture(value, _element, codec) {
    if (value) captureRenderer(value as QgsVectorRenderer, codec);
  },
  restore(value, codec, version) {
    if (value) restoreRenderer(value as QgsVectorRenderer, codec, version);
  },
  write(value, element, codec, target) {
    replaceChildren(
      element,
      ["renderer-v2"],
      value ? [writeRenderer(value as QgsVectorRenderer, codec, target)] : [],
    );
  },
};

const commonRenderer: Entry[] = [
  effect,
  {
    kind: "records",
    field: "orderBy",
    at: ["orderby"],
    item: "orderByClause",
    table: orderByClauseAttributes,
    text: "expression",
  },
  {
    kind: "dataDefined",
    field: "dataDefinedProperties",
    tag: "data-defined-properties",
  },
];
const rendererAttributeEntry = (table: AttributeTable): Entry => ({
  kind: "attributes",
  field: "attributes",
  table,
  exclude: [
    "type",
    "symbollevels",
    "forceraster",
    "referencescale",
    "enableorderby",
  ],
});
const embedded: Entry = {
  kind: "custom",
  field: "renderer",
  custom: nestedRenderer,
};

/** `<data-defined-size-legend>` of a renderer or diagram. */
export const sizeLegendEntry: Entry = {
  kind: "object",
  field: "dataDefinedSizeLegend",
  at: ["data-defined-size-legend"],
  spec: {
    tag: "data-defined-size-legend",
    entries: [
      {
        kind: "attributes",
        field: "attributes",
        table: sizeLegendAttributes,
      },
      { kind: "symbol", field: "symbol", name: "source" },
      {
        kind: "symbol",
        field: "lineSymbol",
        name: "lineSymbol",
        at: ["lineSymbol"],
      },
      { kind: "variant", field: "transformer", at: ["transformer"] },
      {
        kind: "attributes",
        field: "textStyle",
        table: sizeLegendTextStyleAttributes,
        at: ["text-style"],
      },
      {
        kind: "attributes",
        field: "font",
        table: sizeLegendFontAttributes,
        at: ["text-style", "font"],
      },
      {
        kind: "records",
        field: "classes",
        at: ["classes"],
        item: "class",
        table: sizeLegendClassAttributes,
      },
    ],
  },
};

const rendererExtrasByType: Record<string, Entry[]> = {
  singleSymbol: [sizeLegendEntry],
  categorizedSymbol: [sizeLegendEntry],
  graduatedSymbol: [
    sizeLegendEntry,
    {
      kind: "object",
      field: "classificationMethod",
      at: ["classificationMethod"],
      spec: {
        tag: "classificationMethod",
        entries: [
          { kind: "attribute", field: "id", attribute: "id", type: "string" },
          {
            kind: "attributes",
            field: "symmetricMode",
            table: symmetricModeAttributes,
            at: ["symmetricMode"],
          },
          {
            kind: "attributes",
            field: "labelFormat",
            table: classificationLabelFormatAttributes,
            at: ["labelFormat"],
          },
          {
            kind: "variant",
            field: "parameters",
            at: ["parameters", "Option"],
          },
          {
            kind: "attributes",
            field: "extraInformation",
            table: classificationExtraAttributes,
            at: ["extraInformation"],
          },
        ],
      },
    },
  ],
  heatmapRenderer: [
    rendererAttributeEntry(heatmapRendererAttributes),
    {
      kind: "object",
      field: "colorRamp",
      at: ["colorramp"],
      spec: colorRampSpec,
    },
  ],
  pointDisplacement: [
    rendererAttributeEntry(pointDisplacementRendererAttributes),
    {
      kind: "attributes",
      field: "labelFont",
      table: fontAttributes,
      at: ["labelFontProperties"],
    },
    embedded,
    { kind: "symbol", field: "centerSymbol", name: "centerSymbol" },
  ],
  pointCluster: [
    rendererAttributeEntry(pointClusterRendererAttributes),
    embedded,
    { kind: "symbol", field: "clusterSymbol", name: "centerSymbol" },
  ],
  invertedPolygonRenderer: [
    rendererAttributeEntry(invertedPolygonRendererAttributes),
    embedded,
  ],
  mergedFeatureRenderer: [rendererAttributeEntry({}), embedded],
  "25dRenderer": [
    rendererAttributeEntry({}),
    { kind: "symbol", field: "symbol", name: "symbol" },
  ],
};

const rendererSpecs = new Map<string, Spec>();
function rendererExtras(renderer: QgsVectorRenderer): Spec {
  const type = renderer.type;
  let spec = rendererSpecs.get(type);
  if (!spec) {
    spec = {
      tag: "renderer-v2",
      entries: [
        ...commonRenderer,
        ...(Object.hasOwn(rendererExtrasByType, type)
          ? (rendererExtrasByType[type] ?? [])
          : []),
      ],
    };
    rendererSpecs.set(type, spec);
  }
  return spec;
}

/** Wrapper and other renderers modeled only through their spec entries. */
const specRenderers = new Set([
  "heatmapRenderer",
  "pointDisplacement",
  "pointCluster",
  "invertedPolygonRenderer",
  "mergedFeatureRenderer",
  "25dRenderer",
]);

// ---- symbols

export function readSymbol(
  element: XmlElement,
  codec: ExtensionCodec,
  depth = 0,
): QgsSymbol {
  depthGuard(depth, "INVALID_PROJECT");
  const type = element.attributes.type ?? "";
  if (!symbolTypes.has(type))
    throw new QgsError("INVALID_PROJECT", `Unknown symbol type: ${type}`);
  const symbol: QgsSymbol = {
    type: type as QgsSymbolType,
    layers: findChildren(element, "layer").map((layer) =>
      readSymbolLayer(layer, codec, depth),
    ),
  };
  readAttributes(symbol, element, symbolAttributes);
  const dataDefined = readDataDefined(element);
  if (dataDefined) symbol.dataDefinedProperties = dataDefined;
  return codec.remember(symbol, element);
}

function readSymbolLayer(
  element: XmlElement,
  codec: ExtensionCodec,
  depth: number,
): QgsSymbolLayer {
  const layer: QgsSymbolLayer = {
    class: element.attributes.class ?? "",
    properties: readProperties(element),
  };
  readAttributes(layer, element, symbolLayerAttributes);
  const dataDefined = readDataDefined(element);
  if (dataDefined) layer.dataDefinedProperties = dataDefined;
  const sub = findChild(element, "symbol");
  if (sub) layer.subSymbol = readSymbol(sub, codec, depth + 1);
  Object.assign(layer, readSpec(layerExtras, element, codec));
  return codec.remember(layer, element);
}

export function captureSymbol(
  symbol: QgsSymbol,
  codec: ExtensionCodec,
  slot?: Record<string, string>,
): void {
  const element = codec.source(symbol);
  if (!element) return;
  for (const layer of symbol.layers) {
    const layerElement = codec.source(layer);
    if (!layerElement) continue;
    if (layer.subSymbol) captureSymbol(layer.subSymbol, codec);
    codec.bindAttribute(layerElement, "class", ["class"]);
    bindAttributes(codec, layerElement, symbolLayerAttributes);
    bindProperties(binder(codec), layerElement, ["properties"]);
    bindDataDefined(codec, layerElement);
    captureSpec(layerExtras, layer as never, layerElement, codec, []);
    codec.own(layer, layerElement);
  }
  codec.bindAttribute(element, "type", ["type"]);
  bindAttributes(codec, element, symbolAttributes);
  bindDataDefined(codec, element);
  codec.own(symbol, element, slot);
}

export function restoreSymbol(
  symbol: QgsSymbol,
  codec: ExtensionCodec,
  version: string,
  depth = 0,
): void {
  depthGuard(depth, "INVALID_EDIT");
  if (Array.isArray(symbol.layers))
    for (const layer of symbol.layers) {
      if (layer?.subSymbol)
        restoreSymbol(layer.subSymbol, codec, version, depth + 1);
      if (layer) {
        restoreSpec(layerExtras, layer as never, codec, version, 0);
        codec.restoreOwner(layer, version, "layer");
      }
    }
  codec.restoreOwner(symbol, version, "symbol");
}

/** Sub-symbol names follow QGIS (`@<parent>@<layer index>`); QGIS does not resolve them. */
export function writeSymbol(
  symbol: QgsSymbol,
  name: string,
  codec: ExtensionCodec,
  target: QgisVersion,
  depth = 0,
): XmlElement {
  depthGuard(depth, "INVALID_EDIT");
  if (symbol === null || typeof symbol !== "object")
    throw new QgsError("INVALID_EDIT", "A symbol must be an object");
  if (!symbolTypes.has(symbol.type))
    throw new QgsError(
      "INVALID_EDIT",
      `Invalid symbol type: ${String(symbol.type)}`,
    );
  if (!Array.isArray(symbol.layers) || !symbol.layers.length)
    throw new QgsError(
      "INVALID_EDIT",
      "A symbol requires at least one symbol layer",
    );
  const element = structuredClone(
    codec.source(symbol) ?? createElement("symbol"),
  );
  putAttribute(element, "type", symbol.type);
  putAttribute(element, "name", name);
  writeAttributes(element, symbol, symbolAttributes);
  writeDataDefined(element, symbol.dataDefinedProperties);
  replaceChildren(
    element,
    ["layer"],
    symbol.layers.map((layer, index) =>
      writeSymbolLayer(layer, `@${name}@${index}`, codec, target, depth),
    ),
  );
  return element;
}

function writeSymbolLayer(
  layer: QgsSymbolLayer,
  subName: string,
  codec: ExtensionCodec,
  target: QgisVersion,
  depth: number,
): XmlElement {
  if (layer === null || typeof layer !== "object")
    throw new QgsError("INVALID_EDIT", "A symbol layer must be an object");
  if (typeof layer.class !== "string" || !layer.class)
    throw new QgsError(
      "INVALID_EDIT",
      "A symbol layer class must be a non-empty string",
    );
  const element = structuredClone(
    codec.source(layer) ?? createElement("layer"),
  );
  putAttribute(element, "class", layer.class);
  writeAttributes(element, layer, symbolLayerAttributes);
  writeProperties(element, layer.properties, target);
  writeDataDefined(element, layer.dataDefinedProperties);
  writeSpec(layerExtras, layer as never, element, codec, target);
  if (layer.subSymbol)
    replaceChildren(
      element,
      ["symbol"],
      [writeSymbol(layer.subSymbol, subName, codec, target, depth + 1)],
    );
  else remove(element, "symbol");
  return element;
}

// ---- color ramps

function readColorRamp(
  element: XmlElement,
  codec: ExtensionCodec,
): QgsColorRamp {
  return codec.remember(
    {
      type: element.attributes.type ?? "",
      properties: readProperties(element),
    },
    element,
  );
}

function writeColorRamp(
  ramp: QgsColorRamp,
  codec: ExtensionCodec,
  target: QgisVersion,
): XmlElement {
  if (
    ramp === null ||
    typeof ramp !== "object" ||
    typeof ramp.type !== "string"
  )
    throw new QgsError("INVALID_EDIT", "A color ramp requires a string type");
  const element = structuredClone(
    codec.source(ramp) ?? createElement("colorramp"),
  );
  putAttribute(element, "type", ramp.type);
  putAttribute(element, "name", "[source]");
  writeProperties(element, ramp.properties, target);
  return element;
}

// ---- category values

const integerText = /^[+-]?\d+$/u;

/** Mirrors QGIS valueFromString: unparsable typed values remain strings. */
function categoryValue(
  value: string,
  type: string | undefined,
): string | number | boolean | null {
  switch (type) {
    case "double": {
      const parsed = Number(value);
      return value.trim() !== "" && Number.isFinite(parsed) ? parsed : value;
    }
    case "long":
    case "ulong": {
      const parsed = Number(value);
      return integerText.test(value) &&
        Number.isSafeInteger(parsed) &&
        !(type === "ulong" && parsed < 0)
        ? parsed
        : value;
    }
    case "bool": {
      const lower = value.toLowerCase();
      return lower === "true" ? true : lower === "false" ? false : value;
    }
    case "NULL":
      return null;
    default:
      return value;
  }
}

function writeCategoryValue(
  element: XmlElement,
  value: string | number | boolean | null,
): void {
  if (value === null) {
    element.attributes.value = "NULL";
    element.attributes.type = "NULL";
    return;
  }
  let text: string;
  if (typeof value === "string") text = value;
  else if (typeof value === "boolean") text = value ? "true" : "false";
  else if (typeof value === "number" && Number.isFinite(value))
    text = numberText(value);
  else
    throw new QgsError(
      "INVALID_EDIT",
      "Category values must be strings, finite numbers, booleans, null, or lists of them",
    );
  const type = element.attributes.type;
  // Keep the stored type whenever QGIS would read the same value back.
  const unchanged =
    type === undefined
      ? typeof value === "string"
      : Object.is(categoryValue(text, type), value);
  if (!unchanged)
    element.attributes.type =
      typeof value === "string"
        ? "string"
        : typeof value === "boolean"
          ? "bool"
          : Number.isInteger(value)
            ? "long"
            : "double";
  element.attributes.value = text;
}

// ---- renderers

type Take = (name: string | undefined) => QgsSymbol | undefined;

/** QGIS assigns each stored symbol to at most one class; later references find none. */
function symbolTaker(
  container: XmlElement | undefined,
  codec: ExtensionCodec,
): Take {
  const elements = new Map<string, XmlElement>();
  for (const symbol of container ? findChildren(container, "symbol") : [])
    elements.set(symbol.attributes.name ?? "", symbol);
  const taken = new Set<string>();
  return (name) => {
    if (!name || taken.has(name)) return undefined;
    const element = elements.get(name);
    if (!element) return undefined;
    taken.add(name);
    return readSymbol(element, codec);
  };
}

function readCategory(
  element: XmlElement,
  take: Take,
  codec: ExtensionCodec,
): QgsRendererCategory {
  let value: QgsCategoryValue;
  if (element.attributes.value !== undefined)
    value = categoryValue(element.attributes.value, element.attributes.type);
  else {
    const values = findChildren(element, "val").map((item) =>
      categoryValue(item.attributes.value ?? "", item.attributes.type),
    );
    value = values.length ? values : null;
  }
  const category: QgsRendererCategory = { value, label: "", render: true };
  readAttributes(category, element, classAttributes);
  const symbol = take(element.attributes.symbol);
  if (symbol) category.symbol = symbol;
  return codec.remember(category, element);
}

function readRange(
  element: XmlElement,
  take: Take,
  codec: ExtensionCodec,
): QgsRendererRange {
  const range: QgsRendererRange = {
    lower: 0,
    upper: 0,
    label: "",
    render: true,
  };
  readAttributes(range, element, rangeAttributes);
  const symbol = take(element.attributes.symbol);
  if (symbol) range.symbol = symbol;
  return codec.remember(range, element);
}

function readRule(
  element: XmlElement,
  take: Take,
  codec: ExtensionCodec,
  depth = 0,
): QgsRendererRule {
  depthGuard(depth, "INVALID_PROJECT");
  const rule: QgsRendererRule = {
    children: findChildren(element, "rule").map((child) =>
      readRule(child, take, codec, depth + 1),
    ),
  };
  readAttributes(rule, element, ruleAttributes);
  const symbol = take(element.attributes.symbol);
  if (symbol) rule.symbol = symbol;
  return codec.remember(rule, element);
}

function readClassification(
  element: XmlElement,
  codec: ExtensionCodec,
): Pick<
  Extract<QgsVectorRenderer, { type: "categorizedSymbol" }>,
  "sourceSymbol" | "colorRamp"
> {
  const result: { sourceSymbol?: QgsSymbol; colorRamp?: QgsColorRamp } = {};
  const source = findChild(element, "source-symbol");
  const sourceSymbol = source && symbolTaker(source, codec)("0");
  if (sourceSymbol) result.sourceSymbol = sourceSymbol;
  const ramp = findChild(element, "colorramp");
  if (ramp?.attributes.name === "[source]")
    result.colorRamp = readColorRamp(ramp, codec);
  return result;
}

export function readRenderer(
  element: XmlElement,
  codec: ExtensionCodec,
): QgsVectorRenderer {
  const type = element.attributes.type ?? "";
  const take = symbolTaker(findChild(element, "symbols"), codec);
  let renderer: QgsVectorRenderer;
  switch (type) {
    case "singleSymbol": {
      const symbol = take("0");
      renderer = { type, ...(symbol ? { symbol } : {}) };
      break;
    }
    case "categorizedSymbol": {
      const container = findChild(element, "categories");
      renderer = {
        type,
        attribute: element.attributes.attr ?? "",
        categories: container
          ? findChildren(container, "category").map((category) =>
              readCategory(category, take, codec),
            )
          : [],
        ...readClassification(element, codec),
      };
      break;
    }
    case "graduatedSymbol": {
      const container = findChild(element, "ranges");
      renderer = {
        type,
        attribute: element.attributes.attr ?? "",
        ranges: container
          ? findChildren(container, "range").map((range) =>
              readRange(range, take, codec),
            )
          : [],
        ...readClassification(element, codec),
      };
      if (element.attributes.graduatedMethod !== undefined)
        renderer.graduatedMethod = element.attributes.graduatedMethod;
      break;
    }
    case "RuleRenderer": {
      const rules = findChild(element, "rules");
      renderer = {
        type,
        rootRule: rules ? readRule(rules, take, codec) : { children: [] },
      };
      break;
    }
    case "nullSymbol":
      renderer = { type };
      break;
    default:
      renderer = specRenderers.has(type)
        ? ({ type } as QgsVectorRenderer)
        : { type: "unknown", xmlType: type };
  }
  readAttributes(renderer, element, rendererAttributes);
  Object.assign(renderer, readSpec(rendererExtras(renderer), element, codec));
  return codec.remember(renderer, element);
}

function rendererSymbols(renderer: QgsVectorRenderer): QgsSymbol[] {
  switch (renderer.type) {
    case "singleSymbol":
      return renderer.symbol ? [renderer.symbol] : [];
    case "categorizedSymbol":
    case "graduatedSymbol": {
      const classes =
        renderer.type === "categorizedSymbol"
          ? renderer.categories
          : renderer.ranges;
      return [
        ...(Array.isArray(classes) ? classes : []).flatMap((item) =>
          item?.symbol ? [item.symbol] : [],
        ),
        ...(renderer.sourceSymbol ? [renderer.sourceSymbol] : []),
      ];
    }
    default:
      return [];
  }
}

function eachRule(
  rule: QgsRendererRule,
  visit: (rule: QgsRendererRule) => void,
  depth = 0,
): void {
  depthGuard(depth, "INVALID_EDIT");
  if (Array.isArray(rule.children))
    for (const child of rule.children)
      if (child) eachRule(child, visit, depth + 1);
  visit(rule);
}

export function captureRenderer(
  renderer: QgsVectorRenderer,
  codec: ExtensionCodec,
): void {
  const element = codec.source(renderer);
  if (!element) return;
  for (const symbol of rendererSymbols(renderer)) captureSymbol(symbol, codec);
  if (renderer.type === "categorizedSymbol")
    for (const category of renderer.categories) {
      const item = codec.source(category);
      if (!item) continue;
      bindAttributes(codec, item, classAttributes);
      codec.bindAttribute(item, "value", ["value"]);
      for (const [index, value] of findChildren(item, "val").entries())
        codec.bindAttribute(value, "value", ["value", String(index)]);
      codec.own(category, item);
    }
  if (renderer.type === "graduatedSymbol")
    for (const range of renderer.ranges) {
      const item = codec.source(range);
      if (!item) continue;
      bindAttributes(codec, item, rangeAttributes);
      codec.own(range, item);
    }
  if (
    (renderer.type === "categorizedSymbol" ||
      renderer.type === "graduatedSymbol") &&
    renderer.colorRamp
  ) {
    const ramp = codec.source(renderer.colorRamp);
    if (ramp) {
      codec.bindAttribute(ramp, "type", ["type"]);
      bindProperties(binder(codec), ramp, ["properties"]);
      codec.own(renderer.colorRamp, ramp);
    }
  }
  if (renderer.type === "RuleRenderer")
    eachRule(renderer.rootRule, (rule) => {
      const item = codec.source(rule);
      if (rule.symbol) captureSymbol(rule.symbol, codec);
      if (!item) return;
      bindAttributes(codec, item, ruleAttributes);
      codec.own(rule, item);
    });
  codec.bindAttribute(element, "type", [
    renderer.type === "unknown" ? "xmlType" : "type",
  ]);
  if (
    renderer.type === "categorizedSymbol" ||
    renderer.type === "graduatedSymbol"
  )
    codec.bindAttribute(element, "attr", ["attribute"]);
  if (renderer.type === "graduatedSymbol")
    codec.bindAttribute(element, "graduatedMethod", ["graduatedMethod"]);
  bindAttributes(codec, element, rendererAttributes);
  captureSpec(rendererExtras(renderer), renderer as never, element, codec, []);
  codec.own(renderer, element);
}

export function restoreRenderer(
  renderer: QgsVectorRenderer,
  codec: ExtensionCodec,
  version: string,
): void {
  if (renderer === null || typeof renderer !== "object") return;
  for (const symbol of rendererSymbols(renderer))
    restoreSymbol(symbol, codec, version);
  if (
    renderer.type === "categorizedSymbol" &&
    Array.isArray(renderer.categories)
  )
    for (const category of renderer.categories)
      if (category) codec.restoreOwner(category, version, "category");
  if (renderer.type === "graduatedSymbol" && Array.isArray(renderer.ranges))
    for (const range of renderer.ranges)
      if (range) codec.restoreOwner(range, version, "range");
  if (
    (renderer.type === "categorizedSymbol" ||
      renderer.type === "graduatedSymbol") &&
    renderer.colorRamp
  )
    codec.restoreOwner(renderer.colorRamp, version, "colorramp");
  if (renderer.type === "RuleRenderer" && renderer.rootRule)
    eachRule(renderer.rootRule, (rule) => {
      if (rule.symbol) restoreSymbol(rule.symbol, codec, version);
      // A rule may move between the root (<rules>) and child (<rule>) positions.
      const name = rule.extensions?.layout?.name;
      codec.restoreOwner(rule, version, name === "rules" ? "rules" : "rule");
    });
  restoreSpec(rendererExtras(renderer), renderer as never, codec, version, 0);
  codec.restoreOwner(renderer, version, "renderer-v2");
}

function writeRule(
  rule: QgsRendererRule,
  root: boolean,
  addSymbol: (symbol: QgsSymbol) => string,
  codec: ExtensionCodec,
  depth = 0,
): XmlElement {
  depthGuard(depth, "INVALID_EDIT");
  if (
    rule === null ||
    typeof rule !== "object" ||
    !Array.isArray(rule.children)
  )
    throw new QgsError("INVALID_EDIT", "A rule requires a children array");
  const element = structuredClone(codec.source(rule) ?? createElement("rule"));
  element.name = root ? "rules" : "rule";
  // Symbols are numbered in pre-order, as QGIS does.
  putAttribute(
    element,
    "symbol",
    rule.symbol ? addSymbol(rule.symbol) : undefined,
  );
  writeAttributes(element, rule, ruleAttributes);
  replaceChildren(
    element,
    ["rule"],
    rule.children.map((child) =>
      writeRule(child, false, addSymbol, codec, depth + 1),
    ),
  );
  return element;
}

function writeClass(
  element: XmlElement,
  item: QgsRendererCategory | QgsRendererRange,
  table: Attributes,
  addSymbol: (symbol: QgsSymbol) => string,
): void {
  writeAttributes(element, item, table);
  for (const field of ["label", "render"] as const)
    if (item[field] === undefined)
      throw new QgsError("INVALID_EDIT", `A class requires ${field}`);
  putAttribute(
    element,
    "symbol",
    item.symbol ? addSymbol(item.symbol) : undefined,
  );
}

export function writeRenderer(
  renderer: QgsVectorRenderer,
  codec: ExtensionCodec,
  target: QgisVersion,
): XmlElement {
  if (renderer === null || typeof renderer !== "object")
    throw new QgsError("INVALID_EDIT", "A renderer must be an object");
  const element = structuredClone(
    codec.source(renderer) ?? createElement("renderer-v2"),
  );
  const xmlType =
    renderer.type === "unknown" ? renderer.xmlType : renderer.type;
  if (typeof xmlType !== "string")
    throw new QgsError("INVALID_EDIT", "A renderer type must be a string");
  putAttribute(element, "type", xmlType);
  writeAttributes(element, renderer, rendererAttributes);
  const symbols: XmlElement[] = [];
  const addSymbol = (symbol: QgsSymbol): string => {
    const name = String(symbols.length);
    symbols.push(writeSymbol(symbol, name, codec, target));
    return name;
  };
  const writeSymbols = () =>
    replaceChildren(ensure(element, "symbols"), ["symbol"], symbols);
  switch (renderer.type) {
    case "singleSymbol":
      if (renderer.symbol) addSymbol(renderer.symbol);
      writeSymbols();
      break;
    case "categorizedSymbol":
    case "graduatedSymbol": {
      if (typeof renderer.attribute !== "string")
        throw new QgsError(
          "INVALID_EDIT",
          "A renderer attribute must be a string",
        );
      putAttribute(element, "attr", renderer.attribute);
      const categorized = renderer.type === "categorizedSymbol";
      const items = categorized ? renderer.categories : renderer.ranges;
      if (!Array.isArray(items))
        throw new QgsError(
          "INVALID_EDIT",
          `A ${renderer.type} renderer requires ${categorized ? "categories" : "ranges"}`,
        );
      const tag = categorized ? "category" : "range";
      const encoded = items.map((item) => {
        const item_ = structuredClone(codec.source(item) ?? createElement(tag));
        if (categorized) {
          const value = (item as QgsRendererCategory).value;
          if (Array.isArray(value)) {
            delete item_.attributes.value;
            delete item_.attributes.type;
            const existing = findChildren(item_, "val");
            replaceChildren(
              item_,
              ["val"],
              value.map((entry, index) => {
                const child = existing[index] ?? createElement("val");
                writeCategoryValue(child, entry);
                return child;
              }),
            );
          } else {
            remove(item_, "val");
            writeCategoryValue(item_, value);
          }
        }
        writeClass(
          item_,
          item,
          categorized ? classAttributes : rangeAttributes,
          addSymbol,
        );
        return item_;
      });
      replaceChildren(
        ensure(element, categorized ? "categories" : "ranges"),
        [tag],
        encoded,
      );
      writeSymbols();
      if (renderer.type === "graduatedSymbol")
        writeAttributes(element, renderer, [
          ["graduatedMethod", "graduatedMethod", "string"],
        ]);
      if (renderer.sourceSymbol)
        replaceChildren(
          ensure(element, "source-symbol"),
          ["symbol"],
          [writeSymbol(renderer.sourceSymbol, "0", codec, target)],
        );
      else remove(element, "source-symbol");
      if (renderer.colorRamp)
        replaceChildren(
          element,
          ["colorramp"],
          [writeColorRamp(renderer.colorRamp, codec, target)],
        );
      else remove(element, "colorramp");
      break;
    }
    case "RuleRenderer":
      replaceChildren(
        element,
        ["rules"],
        [writeRule(renderer.rootRule, true, addSymbol, codec)],
      );
      writeSymbols();
      break;
    case "nullSymbol":
    case "unknown":
      break;
    default:
      if (!specRenderers.has(renderer.type))
        throw new QgsError(
          "INVALID_EDIT",
          `Unknown renderer type: ${String((renderer as { type: unknown }).type)}`,
        );
  }
  writeSpec(
    rendererExtras(renderer),
    renderer as never,
    element,
    codec,
    target,
  );
  return element;
}
