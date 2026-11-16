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
import { labeling } from "./labeling.ts";
import { rasterAttributes } from "./schema.ts";
import { readSpec, type Spec, writeSpec } from "./spec.ts";
import { readRenderer, writeRenderer } from "./symbology.ts";
import type {
  QgisVersion,
  QgsField,
  QgsMapLayer,
  QgsMapLayerBase,
  QgsRasterRenderer,
  XmlElement,
} from "./types.ts";
import { createElement, findChild, findChildren } from "./xml.ts";

/** Vector layer settings described declaratively; the rest is hand-written below. */
export const vectorLayerSpec: Spec = {
  tag: "maplayer",
  entries: [{ kind: "custom", field: "labeling", custom: labeling }],
};

export function readLayerId(element: XmlElement): string {
  return text(element, "id") ?? element.attributes.id ?? "";
}

function readFields(layer: XmlElement, codec: ExtensionCodec): QgsField[] {
  const configuration = findChild(layer, "fieldConfiguration");
  const aliases = findChild(layer, "aliases");
  const defaults = findChild(layer, "defaults");
  const elements = configuration ? findChildren(configuration, "field") : [];
  for (const [container, tag] of [
    [aliases, "alias"],
    [defaults, "default"],
  ] as const) {
    const seen = new Set<string>();
    for (const record of container ? findChildren(container, tag) : []) {
      const name = record.attributes.field;
      if (name === undefined || seen.has(name))
        throw new QgsError(
          "INVALID_PROJECT",
          `${tag} records require a unique field name`,
        );
      seen.add(name);
      if (!elements.some((element) => element.attributes.name === name))
        elements.push(createElement("field", { name }));
    }
  }
  return elements.map((element) => {
    const field: QgsField = {
      name: element.attributes.name ?? "",
    };
    const editorWidget = findChild(element, "editWidget")?.attributes.type;
    const alias =
      aliases &&
      findChildren(aliases, "alias").find(
        (alias) => alias.attributes.field === field.name,
      );
    const defaultValue =
      defaults &&
      findChildren(defaults, "default").find(
        (value) => value.attributes.field === field.name,
      );
    if (editorWidget !== undefined) field.editorWidgetType = editorWidget;
    if (alias) field.alias = alias.attributes.name ?? "";
    if (defaultValue)
      field.defaultExpression = defaultValue.attributes.expression ?? "";
    const apply = boolean(defaultValue?.attributes.applyOnUpdate);
    if (apply !== undefined) field.applyDefaultOnUpdate = apply;
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
      if (field.editorWidgetType !== undefined)
        putAttribute(
          ensure(element, "editWidget"),
          "type",
          field.editorWidgetType,
        );
      else remove(element, "editWidget");
      return element;
    }),
  );
  for (const [containerName, tag] of [
    ["aliases", "alias"],
    ["defaults", "default"],
  ] as const) {
    const container = findChild(layer, containerName);
    const previous = container ? findChildren(container, tag) : [];
    const records = fields.flatMap((field) => {
      if (tag === "alias" && field.alias === undefined) return [];
      if (
        tag === "default" &&
        field.defaultExpression === undefined &&
        field.applyDefaultOnUpdate === undefined
      )
        return [];
      const originalName = codec.source(field)?.attributes.name ?? field.name;
      const index = previous.findIndex(
        (record) => record.attributes.field === originalName,
      );
      const element = structuredClone(previous[index] ?? createElement(tag));
      putAttribute(element, "field", field.name);
      if (tag === "alias") putAttribute(element, "name", field.alias);
      else {
        putAttribute(element, "expression", field.defaultExpression ?? "");
        putAttribute(element, "applyOnUpdate", field.applyDefaultOnUpdate);
      }
      return [{ element, index: index < 0 ? Infinity : index }];
    });
    records.sort((left, right) => left.index - right.index);
    if (container || records.length)
      replaceChildren(
        container ?? ensure(layer, containerName),
        [tag],
        records.map((record) => record.element),
      );
  }
}

function readRasterRenderer(layer: XmlElement): QgsRasterRenderer | undefined {
  const pipe = findChild(layer, "pipe");
  const element = pipe && findChild(pipe, "rasterrenderer");
  if (!element) return undefined;
  const renderer: QgsRasterRenderer = { type: element.attributes.type ?? "" };
  for (const [field, attr] of Object.entries(rasterAttributes)) {
    const value = number(element.attributes[attr]);
    if (value !== undefined)
      renderer[field as keyof typeof rasterAttributes] = value;
  }
  return renderer;
}

function writeRasterRenderer(
  layer: XmlElement,
  renderer: QgsRasterRenderer | undefined,
): void {
  if (!renderer) {
    const pipe = findChild(layer, "pipe");
    if (pipe) remove(pipe, "rasterrenderer");
    return;
  }
  const element = ensure(ensure(layer, "pipe"), "rasterrenderer");
  putAttribute(element, "type", renderer.type);
  for (const [field, attr] of Object.entries(rasterAttributes))
    putAttribute(
      element,
      attr,
      renderer[field as keyof typeof rasterAttributes],
    );
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
    case "raster": {
      const renderer = readRasterRenderer(element);
      return codec.remember(
        { ...base, type, ...(renderer ? { renderer } : {}) },
        element,
      );
    }
    case "pointcloud":
      return codec.remember({ ...base, type: "point-cloud" }, element);
    case "mesh":
    case "vector-tile":
    case "point-cloud":
    case "plugin":
    case "annotation":
    case "group":
    case "tiled-scene":
      return codec.remember({ ...base, type }, element);
    default:
      return codec.remember(
        {
          ...base,
          type: "unknown",
          xmlType: element.attributes.type ?? "",
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
    writeSpec(vectorLayerSpec, layer as never, element, codec, target);
  } else if (layer.type === "raster")
    writeRasterRenderer(element, layer.renderer);
  // QGIS 3.x rejects vector tile layer XML without a renderer, even with a valid URI.
  // styleUrl is connection metadata; it does not replace native renderer XML.
  else if (layer.type === "vector-tile" && !findChild(element, "renderer"))
    element.children.push(defaultTileRenderer());
  return element;
}
