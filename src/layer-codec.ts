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
import type {
  QgsField,
  QgsMapLayer,
  QgsMapLayerBase,
  QgsRasterRenderer,
  QgsVectorRenderer,
  XmlElement,
} from "./types.ts";
import { createElement, findChild, findChildren } from "./xml.ts";

export function readLayerId(element: XmlElement): string {
  return text(element, "id") ?? element.attributes.id ?? "";
}

function readFields(layer: XmlElement): QgsField[] {
  const configuration = findChild(layer, "fieldConfiguration");
  if (!configuration) return [];
  const aliases = findChild(layer, "aliases");
  const defaults = findChild(layer, "defaults");
  return findChildren(configuration, "field").map((element) => {
    const field: QgsField = {
      name: element.attributes.name ?? "",
      preservedXml: element,
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
    if (alias?.attributes.name !== undefined)
      field.alias = alias.attributes.name;
    if (defaultValue?.attributes.expression !== undefined)
      field.defaultExpression = defaultValue.attributes.expression;
    const apply = boolean(defaultValue?.attributes.applyOnUpdate);
    if (apply !== undefined) field.applyDefaultOnUpdate = apply;
    return field;
  });
}

function writeFields(layer: XmlElement, fields: QgsField[]): void {
  const originalConfiguration = findChild(layer, "fieldConfiguration");
  const originalNames = new Set(
    originalConfiguration
      ? findChildren(originalConfiguration, "field").map(
          (field) => field.attributes.name,
        )
      : [],
  );
  const names = new Set<string>();
  for (const field of fields) {
    if (names.has(field.name))
      throw new QgsError("INVALID_EDIT", `Duplicate field: ${field.name}`);
    names.add(field.name);
  }
  if (fields.length || findChild(layer, "fieldConfiguration")) {
    replaceChildren(
      ensure(layer, "fieldConfiguration"),
      ["field"],
      fields.map((field) => {
        const element = structuredClone(
          field.preservedXml ?? createElement("field"),
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
  }
  for (const [containerName, tag] of [
    ["aliases", "alias"],
    ["defaults", "default"],
  ] as const) {
    const container = findChild(layer, containerName);
    const records = fields.flatMap((field) => {
      if (tag === "alias" && field.alias === undefined) return [];
      if (
        tag === "default" &&
        field.defaultExpression === undefined &&
        field.applyDefaultOnUpdate === undefined
      )
        return [];
      const originalName = field.preservedXml?.attributes.name ?? field.name;
      const old =
        container &&
        findChildren(container, tag).find(
          (node) => node.attributes.field === originalName,
        );
      const element = structuredClone(old ?? createElement(tag));
      putAttribute(element, "field", field.name);
      if (tag === "alias") putAttribute(element, "name", field.alias);
      else {
        putAttribute(element, "expression", field.defaultExpression);
        putAttribute(element, "applyOnUpdate", field.applyDefaultOnUpdate);
      }
      return [element];
    });
    // Keep each record's original position, including entries from older writers
    // that have aliases/defaults without a corresponding fieldConfiguration.
    const ordered: XmlElement[] = [];
    const remaining = new Set(records);
    if (container)
      for (const old of findChildren(container, tag)) {
        const field = fields.find(
          (field) =>
            (field.preservedXml?.attributes.name ?? field.name) ===
            old.attributes.field,
        );
        const record =
          field &&
          records.find((record) => record.attributes.field === field.name);
        if (record) {
          ordered.push(record);
          remaining.delete(record);
        } else if (!field && !originalNames.has(old.attributes.field))
          ordered.push(old);
      }
    ordered.push(...remaining);
    if (container || records.length)
      replaceChildren(
        container ?? ensure(layer, containerName),
        [tag],
        ordered,
      );
  }
}

function readVectorRenderer(layer: XmlElement): QgsVectorRenderer | undefined {
  const element = findChild(layer, "renderer-v2");
  if (!element) return undefined;
  const renderer: QgsVectorRenderer = { type: element.attributes.type ?? "" };
  if (element.attributes.attr !== undefined)
    renderer.attribute = element.attributes.attr;
  const levels = boolean(element.attributes.symbollevels);
  const force = boolean(element.attributes.forceraster);
  const scale = number(element.attributes.referencescale);
  if (levels !== undefined) renderer.symbolLevels = levels;
  if (force !== undefined) renderer.forceRaster = force;
  if (scale !== undefined) renderer.referenceScale = scale;
  return renderer;
}

function writeVectorRenderer(
  layer: XmlElement,
  renderer: QgsVectorRenderer | undefined,
): void {
  if (!renderer) {
    remove(layer, "renderer-v2");
    return;
  }
  const element = ensure(layer, "renderer-v2");
  putAttribute(element, "type", renderer.type);
  putAttribute(element, "attr", renderer.attribute);
  putAttribute(element, "symbollevels", renderer.symbolLevels);
  putAttribute(element, "forceraster", renderer.forceRaster);
  putAttribute(element, "referencescale", renderer.referenceScale);
}

const rasterAttributes = {
  opacity: "opacity",
  alphaBand: "alphaBand",
  band: "band",
  redBand: "redBand",
  greenBand: "greenBand",
  blueBand: "blueBand",
} as const;
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

export function readLayer(element: XmlElement): QgsMapLayer {
  const base: QgsMapLayerBase = {
    id: readLayerId(element),
    name: text(element, "layername") ?? "",
    source: text(element, "datasource") ?? "",
    provider: text(element, "provider") ?? "",
    preservedXml: element,
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
        fields: readFields(element),
      };
      if (element.attributes.geometry !== undefined)
        layer.geometry = element.attributes.geometry;
      if (element.attributes.wkbType !== undefined)
        layer.wkbType = element.attributes.wkbType;
      const readOnly = boolean(element.attributes.readOnly);
      const labelsEnabled = boolean(element.attributes.labelsEnabled);
      const renderer = readVectorRenderer(element);
      if (readOnly !== undefined) layer.readOnly = readOnly;
      if (labelsEnabled !== undefined) layer.labelsEnabled = labelsEnabled;
      if (renderer) layer.renderer = renderer;
      return layer;
    }
    case "raster": {
      const renderer = readRasterRenderer(element);
      return { ...base, type, ...(renderer ? { renderer } : {}) };
    }
    case "pointcloud":
      return { ...base, type: "point-cloud" };
    case "mesh":
    case "vector-tile":
    case "point-cloud":
    case "plugin":
    case "annotation":
    case "group":
    case "tiled-scene":
      return { ...base, type };
    default:
      return {
        ...base,
        type: "unknown",
        xmlType: element.attributes.type ?? "",
      };
  }
}

export function writeLayer(layer: QgsMapLayer): XmlElement {
  if (typeof layer.id !== "string" || !layer.id.trim())
    throw new QgsError("INVALID_EDIT", "A layer ID must not be empty");
  const element = structuredClone(
    layer.preservedXml ?? createElement("maplayer"),
  );
  const xmlType = layer.type === "unknown" ? layer.xmlType : layer.type;
  const originalType = element.attributes.type?.toLowerCase();
  if (
    originalType !== xmlType &&
    !(xmlType === "point-cloud" && originalType === "pointcloud") &&
    !(xmlType === "" && originalType === undefined)
  )
    putAttribute(element, "type", xmlType);
  for (const [tag, value] of [
    ["id", layer.id],
    ["layername", layer.name],
    ["datasource", layer.source],
    ["provider", layer.provider],
  ] as const) {
    if (
      tag === "id" &&
      element.attributes.id !== undefined &&
      !findChild(element, "id")
    ) {
      putAttribute(element, "id", value);
      continue;
    }
    if (value !== "" || findChild(element, tag)) putText(element, tag, value);
  }
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
    writeFields(element, layer.fields);
    writeVectorRenderer(element, layer.renderer);
  } else if (layer.type === "raster")
    writeRasterRenderer(element, layer.renderer);
  return element;
}
