import {
  boolean,
  ensure,
  number,
  putAttribute,
  putNumber,
  putText,
  readCrs,
  readExtent,
  remove,
  replaceChildren,
  text,
  writeCrs,
  writeExtent,
} from "./codec.ts";
import { QgsError } from "./errors.ts";
import type { ExtensionCodec } from "./extensions.ts";
import {
  commonLayerEntries,
  rasterLabelingEntry,
  styleVariants,
  vectorLayerEntries,
} from "./layer-settings.ts";
import {
  annotationEntries,
  groupEntries,
  meshEntries,
  pointCloudEntries,
  tiledSceneEntries,
  vectorTileEntries,
} from "./layer-types.ts";
import { rasterLayerSpec } from "./raster.ts";
import { fieldRecords } from "./schema.ts";
import {
  type Custom,
  type Entry,
  readSpec,
  type Spec,
  writeSpec,
} from "./spec.ts";
import { nestedRenderer, readRenderer, writeRenderer } from "./symbology.ts";
import type {
  QgisVersion,
  QgsField,
  QgsMapLayer,
  QgsMapLayerBase,
  XmlElement,
} from "./types.ts";
import { mergeUnmodeled } from "./unmodeled.ts";
import { readVariant, writeVariant } from "./variant.ts";
import { createElement, findChild, findChildren } from "./xml.ts";

/** Fields and their records in a style document; absent unless it stores fields. */
const styleFields: Custom = {
  read(element, codec) {
    const stored =
      findChild(element, "fieldConfiguration") ||
      fieldRecords.some((table) => findChild(element, table.container));
    return stored ? readFields(element, codec) : undefined;
  },
  capture(value, element, codec, path) {
    if (Array.isArray(value)) codec.captureFields(value, element, path);
  },
  restore(value, codec, version) {
    if (Array.isArray(value)) codec.restoreFields(value, version);
  },
  write(value, element, codec) {
    if (value === undefined) return;
    if (!Array.isArray(value))
      throw new QgsError("INVALID_EDIT", "Style fields must be an array");
    writeFields(element, value as QgsField[], codec);
  },
};

const scale = (field: string, attribute: string): Entry => ({
  kind: "attribute",
  field,
  attribute,
  type: "number",
});
// Style variants hold the same settings as their layer, plus those the layer
// itself reads by hand, such as its renderer and opacity.
const styleExtras: Entry[] = [
  { kind: "text", field: "opacity", at: ["layerOpacity"], type: "number" },
  scale("minScale", "minScale"),
  scale("maxScale", "maxScale"),
  {
    kind: "attribute",
    field: "scaleBasedVisibility",
    attribute: "hasScaleBasedVisibilityFlag",
    type: "boolean",
  },
];
const withVariants = (entries: Entry[], extra: Entry[] = []): Spec => ({
  tag: "maplayer",
  entries: [...entries, styleVariants([...entries, ...styleExtras, ...extra])],
});
const commonLayerSpec = withVariants(commonLayerEntries);
const vectorLayerSpec = withVariants(
  [...commonLayerEntries, ...vectorLayerEntries],
  [
    { kind: "custom", field: "renderer", custom: nestedRenderer },
    { kind: "custom", field: "fields", custom: styleFields },
    {
      kind: "attribute",
      field: "labelsEnabled",
      attribute: "labelsEnabled",
      type: "boolean",
    },
    {
      kind: "attribute",
      field: "readOnly",
      attribute: "readOnly",
      type: "boolean",
    },
  ],
);
const rasterSpec = withVariants([
  ...commonLayerEntries,
  ...rasterLayerSpec.entries,
  rasterLabelingEntry,
]);
const typeSpecs: Record<string, Spec> = Object.fromEntries(
  Object.entries({
    "vector-tile": vectorTileEntries,
    mesh: meshEntries,
    annotation: annotationEntries,
    group: groupEntries,
    "point-cloud": pointCloudEntries,
    "tiled-scene": tiledSceneEntries,
  }).map(([type, entries]) => [
    type,
    withVariants([...commonLayerEntries, ...entries]),
  ]),
);

/** Declarative settings of a layer type; hand-written settings are handled below. */
export function layerSpec(type: string): Spec {
  if (type === "vector") return vectorLayerSpec;
  if (type === "raster") return rasterSpec;
  return (Object.hasOwn(typeSpecs, type) && typeSpecs[type]) || commonLayerSpec;
}

export function readLayerId(element: XmlElement): string {
  return text(element, "id") ?? element.attributes.id ?? "";
}

function recordValue(
  raw: string | undefined,
  type: "string" | "number" | "boolean",
): string | number | boolean | undefined {
  if (raw === undefined) return undefined;
  return type === "number"
    ? number(raw)
    : type === "boolean"
      ? boolean(raw)
      : raw;
}

/** Records keyed by field name; duplicates are ambiguous and rejected. */
export function fieldRecordMap(
  layer: XmlElement,
  container: string,
  tag: string,
  key: string,
): Map<string, XmlElement> {
  const parent = findChild(layer, container);
  const records = new Map<string, XmlElement>();
  for (const record of parent ? findChildren(parent, tag) : []) {
    const name = record.attributes[key];
    if (name === undefined || records.has(name))
      throw new QgsError(
        "INVALID_PROJECT",
        `${container} records require a unique field name`,
      );
    records.set(name, record);
  }
  return records;
}

function readFields(layer: XmlElement, codec: ExtensionCodec): QgsField[] {
  const configuration = findChild(layer, "fieldConfiguration");
  const elements = configuration ? findChildren(configuration, "field") : [];
  const tables = fieldRecords.map((table) => ({
    table,
    records: fieldRecordMap(layer, table.container, table.tag, table.key),
  }));
  for (const { table, records } of tables)
    if (table.defines)
      for (const name of records.keys())
        if (!elements.some((element) => element.attributes.name === name))
          elements.push(createElement("field", { name }));
  return elements.map((element) => {
    const field: QgsField = {
      name: element.attributes.name ?? "",
    };
    const editWidget = findChild(element, "editWidget");
    if (editWidget?.attributes.type !== undefined)
      field.editorWidgetType = editWidget.attributes.type;
    const config = editWidget && findChild(editWidget, "config");
    const option = config && findChild(config, "Option");
    const widgetConfig = option && readVariant(option);
    if (widgetConfig !== undefined && widgetConfig !== null)
      field.editorWidgetConfig = widgetConfig;
    if (element.attributes.configurationFlags !== undefined)
      field.configurationFlags = element.attributes.configurationFlags;
    const target = field as unknown as Record<string, unknown>;
    for (const { table, records } of tables) {
      const record = records.get(field.name);
      if (!record) continue;
      for (const [attribute, [property, type, fallback]] of Object.entries(
        table.values,
      )) {
        const value = recordValue(
          record.attributes[attribute] ?? fallback,
          type,
        );
        if (value !== undefined) target[property] = value;
      }
    }
    return codec.remember(field, element);
  });
}

function writeFields(
  layer: XmlElement,
  fields: QgsField[],
  codec: ExtensionCodec,
): void {
  const names = new Set<string>();
  for (const field of fields) {
    if (names.has(field.name))
      throw new QgsError("INVALID_EDIT", `Duplicate field: ${field.name}`);
    names.add(field.name);
  }
  replaceChildren(
    ensure(layer, "fieldConfiguration"),
    ["field"],
    fields.map((field) => {
      const element = structuredClone(
        codec.source(field) ?? createElement("field"),
      );
      putAttribute(element, "name", field.name);
      putAttribute(element, "configurationFlags", field.configurationFlags);
      if (
        field.editorWidgetType !== undefined ||
        field.editorWidgetConfig !== undefined
      ) {
        const editWidget = ensure(element, "editWidget");
        putAttribute(editWidget, "type", field.editorWidgetType);
        const config = findChild(editWidget, "config");
        const option = config && findChild(config, "Option");
        if (field.editorWidgetConfig !== undefined)
          writeVariant(
            option ?? ensure(ensure(editWidget, "config"), "Option"),
            field.editorWidgetConfig,
          );
        else if (option) writeVariant(option, null);
      } else remove(element, "editWidget");
      return element;
    }),
  );
  for (const table of fieldRecords) {
    const container = findChild(layer, table.container);
    const previous = container ? findChildren(container, table.tag) : [];
    const records = fields.flatMap((field, position) => {
      const source = field as unknown as Record<string, unknown>;
      const entries = Object.entries(table.values);
      if (entries.every(([, [property]]) => source[property] === undefined))
        return [];
      const originalName = codec.source(field)?.attributes.name ?? field.name;
      const index = previous.findIndex(
        (record) => record.attributes[table.key] === originalName,
      );
      const element = structuredClone(
        previous[index] ?? createElement(table.tag),
      );
      putAttribute(element, table.key, field.name);
      if (table.position) putAttribute(element, table.position, position);
      const prefix = `${table.container}/${table.tag}`;
      mergeUnmodeled(
        element,
        Object.fromEntries(
          Object.entries(field.unmodeled ?? {}).flatMap(([path, entry]) =>
            path === prefix
              ? [[".", entry]]
              : path.startsWith(`${prefix}/`)
                ? [[path.slice(prefix.length + 1), entry]]
                : [],
          ),
        ),
      );
      for (const [attribute, [property, type, fallback]] of entries) {
        const value = source[property] ?? fallback;
        if (value !== undefined && typeof value !== type)
          throw new QgsError("INVALID_EDIT", `${property} must be a ${type}`);
        putAttribute(element, attribute, value as string | number | boolean);
      }
      return [
        { element, name: field.name, index: index < 0 ? Infinity : index },
      ];
    });
    records.sort((left, right) =>
      table.sorted
        ? Number(left.name > right.name) - Number(left.name < right.name)
        : left.index - right.index,
    );
    if (container || records.length)
      replaceChildren(
        container ?? ensure(layer, table.container),
        [table.tag],
        records.map((record) => record.element),
      );
  }
}

export function readLayer(
  element: XmlElement,
  codec: ExtensionCodec,
): QgsMapLayer {
  const base: QgsMapLayerBase = {
    id: readLayerId(element),
    name: text(element, "layername") ?? "",
    source: text(element, "datasource") ?? "",
    provider: text(element, "provider") ?? "",
  };
  const encoding = findChild(element, "provider")?.attributes.encoding;
  if (encoding !== undefined) base.providerEncoding = encoding;
  const crs = readCrs(element, "srs");
  const extent = readExtent(element);
  const opacity = number(text(element, "layerOpacity"));
  const minScale = number(element.attributes.minScale);
  const maxScale = number(element.attributes.maxScale);
  const scaleBasedVisibility = boolean(
    element.attributes.hasScaleBasedVisibilityFlag,
  );
  if (crs) base.crs = crs;
  if (extent) base.extent = extent;
  if (opacity !== undefined) base.opacity = opacity;
  if (minScale !== undefined) base.minScale = minScale;
  if (maxScale !== undefined) base.maxScale = maxScale;
  if (scaleBasedVisibility !== undefined)
    base.scaleBasedVisibility = scaleBasedVisibility;
  const type = element.attributes.type?.toLowerCase() ?? "";
  switch (type) {
    case "vector": {
      const layer: Extract<QgsMapLayer, { type: "vector" }> = {
        ...base,
        type,
        fields: readFields(element, codec),
      };
      if (element.attributes.geometry !== undefined)
        layer.geometry = element.attributes.geometry;
      if (element.attributes.wkbType !== undefined)
        layer.wkbType = element.attributes.wkbType;
      const readOnly = boolean(element.attributes.readOnly);
      const labelsEnabled = boolean(element.attributes.labelsEnabled);
      const rendererElement = findChild(element, "renderer-v2");
      const renderer = rendererElement && readRenderer(rendererElement, codec);
      if (readOnly !== undefined) layer.readOnly = readOnly;
      if (labelsEnabled !== undefined) layer.labelsEnabled = labelsEnabled;
      if (renderer) layer.renderer = renderer;
      Object.assign(layer, readSpec(vectorLayerSpec, element, codec));
      return codec.remember(layer, element);
    }
    case "raster":
      return codec.remember(
        { ...base, type, ...readSpec(rasterSpec, element, codec) },
        element,
      );
    case "pointcloud":
      return codec.remember(
        {
          ...base,
          type: "point-cloud",
          ...readSpec(layerSpec("point-cloud"), element, codec),
        },
        element,
      );
    case "mesh":
    case "vector-tile":
    case "point-cloud":
    case "plugin":
    case "annotation":
    case "group":
    case "tiled-scene":
      return codec.remember(
        { ...base, type, ...readSpec(layerSpec(type), element, codec) },
        element,
      );
    default:
      return codec.remember(
        {
          ...base,
          type: "unknown",
          xmlType: element.attributes.type ?? "",
          ...readSpec(commonLayerSpec, element, codec),
        },
        element,
      );
  }
}

function defaultTileRenderer(): XmlElement {
  const styles = [
    {
      name: "Polygons",
      geometry: "2",
      symbol: "fill",
      symbolLayer: "SimpleFill",
    },
    { name: "Lines", geometry: "1", symbol: "line", symbolLayer: "SimpleLine" },
    {
      name: "Points",
      geometry: "0",
      symbol: "marker",
      symbolLayer: "SimpleMarker",
    },
  ].map((style) =>
    createElement(
      "style",
      {
        name: style.name,
        geometry: style.geometry,
        layer: "",
        enabled: "1",
        "min-zoom": "-1",
        "max-zoom": "-1",
      },
      [
        createElement("symbols", {}, [
          createElement(
            "symbol",
            {
              name: "0",
              type: style.symbol,
              alpha: "1",
            },
            [
              createElement("layer", {
                class: style.symbolLayer,
                enabled: "1",
                locked: "0",
                pass: "0",
              }),
            ],
          ),
        ]),
      ],
    ),
  );
  return createElement("renderer", { type: "basic" }, [
    createElement("styles", {}, styles),
  ]);
}

export function writeLayer(
  layer: QgsMapLayer,
  codec: ExtensionCodec,
  target: QgisVersion,
): XmlElement {
  if (typeof layer.id !== "string" || !layer.id.trim())
    throw new QgsError("INVALID_EDIT", "A layer ID must not be empty");
  const source = codec.source(layer);
  // QGIS replaces IDs of 10 UTF-16 code units or fewer, leaving tree/order
  // references dangling. Validate parsed models by the same rules as new ones.
  // Rewriting IDs here would also require updating unmodeled references.
  if (layer.id.length <= 10)
    throw new QgsError(
      "INVALID_EDIT",
      `Layer ID ${JSON.stringify(layer.id)} must contain at least 11 characters; QGIS replaces shorter IDs and breaks layer references`,
    );
  const element = structuredClone(source ?? createElement("maplayer"));
  const xmlType = layer.type === "unknown" ? layer.xmlType : layer.type;
  putAttribute(
    element,
    "type",
    xmlType === "point-cloud" ? "pointcloud" : xmlType,
  );
  for (const [tag, value] of [
    ["id", layer.id],
    ["layername", layer.name],
    ["datasource", layer.source],
    ["provider", layer.provider],
  ] as const) {
    // Annotation and group layers store no provider; empty means absent there.
    if (
      value === "" &&
      tag === "provider" &&
      (layer.type === "annotation" || layer.type === "group") &&
      !findChild(element, tag)
    )
      continue;
    putText(element, tag, value);
  }
  if (element.attributes.id !== undefined)
    putAttribute(element, "id", layer.id);
  if (layer.providerEncoding !== undefined || findChild(element, "provider"))
    putAttribute(
      ensure(element, "provider"),
      "encoding",
      layer.providerEncoding,
    );
  writeCrs(element, "srs", layer.crs);
  writeExtent(element, layer.extent);
  putNumber(element, "layerOpacity", layer.opacity);
  putAttribute(element, "minScale", layer.minScale);
  putAttribute(element, "maxScale", layer.maxScale);
  putAttribute(
    element,
    "hasScaleBasedVisibilityFlag",
    layer.scaleBasedVisibility,
  );
  if (layer.type === "vector") {
    putAttribute(element, "geometry", layer.geometry);
    putAttribute(element, "wkbType", layer.wkbType);
    putAttribute(element, "readOnly", layer.readOnly);
    putAttribute(element, "labelsEnabled", layer.labelsEnabled);
    writeFields(element, layer.fields, codec);
    replaceChildren(
      element,
      ["renderer-v2"],
      layer.renderer ? [writeRenderer(layer.renderer, codec, target)] : [],
    );
  }
  writeSpec(layerSpec(layer.type), layer as never, element, codec, target);
  // QGIS writes default actions before the actions they refer to.
  const actions = findChild(element, "attributeactions");
  if (actions)
    actions.children.sort(
      (a, b) =>
        Number(b.type === "element" && b.name === "defaultAction") -
        Number(a.type === "element" && a.name === "defaultAction"),
    );
  // QGIS writes virtual fields twice in a layer; it reads the first copy.
  const [virtualFields, ...copies] = findChildren(element, "expressionfields");
  if (layer.type === "vector" && virtualFields && !copies.length)
    element.children.push(structuredClone(virtualFields));
  // QGIS 3.x rejects vector tile layer XML without a renderer, even with a valid URI.
  // styleUrl is connection metadata; it does not replace native renderer XML.
  if (layer.type === "vector-tile" && !findChild(element, "renderer"))
    element.children.push(defaultTileRenderer());
  return element;
}
