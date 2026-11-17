import {
  brightnessContrastAttributes,
  colorRampItemAttributes,
  colorRampShaderAttributes,
  contrastEnhancementAttributes,
  hueSaturationAttributes,
  minMaxOriginAttributes,
  noDataRangeAttributes,
  paletteEntryAttributes,
  pixelListEntryAttributes,
  providerResamplingAttributes,
  rampLegendSettingsAttributes,
  rasterAttributeTableAttributes,
  rasterRendererAttributes,
  rasterResamplerAttributes,
} from "./attributes.generated.ts";
import type { Entry, Spec } from "./spec.ts";

const attribute = (
  field: string,
  name: string,
  type: "string" | "number" | "boolean" = "number",
): Entry => ({ kind: "attribute", field, attribute: name, type });

/** Source color ramp stored inline, referenced by QGIS through the name `[source]`. */
export const colorRampSpec: Spec = {
  tag: "colorramp",
  entries: [
    attribute("type", "type", "string"),
    { kind: "constant", attribute: "name", value: "[source]" },
    { kind: "properties", field: "properties" },
  ],
};

/** `<colorrampshader>`, shared by raster, mesh, and point cloud renderers. */
export const colorRampShaderSpec: Spec = {
  tag: "colorrampshader",
  entries: [
    {
      kind: "attributes",
      field: "attributes",
      table: colorRampShaderAttributes,
    },
    {
      kind: "object",
      field: "colorRamp",
      at: ["colorramp"],
      spec: colorRampSpec,
    },
    {
      kind: "records",
      field: "items",
      table: colorRampItemAttributes,
      at: [],
      item: "item",
    },
    {
      kind: "attributes",
      field: "legend",
      table: rampLegendSettingsAttributes,
      at: ["rampLegendSettings"],
    },
  ],
};

export const contrast = (field: string): Entry => ({
  kind: "texts",
  field,
  at: [field],
  table: contrastEnhancementAttributes,
});

const rendererSpec: Spec = {
  tag: "rasterrenderer",
  entries: [
    attribute("type", "type", "string"),
    attribute("opacity", "opacity"),
    attribute("alphaBand", "alphaBand"),
    attribute("band", "band"),
    attribute("redBand", "redBand"),
    attribute("greenBand", "greenBand"),
    attribute("blueBand", "blueBand"),
    {
      kind: "attributes",
      field: "attributes",
      table: rasterRendererAttributes,
    },
    {
      kind: "texts",
      field: "minMaxOrigin",
      at: ["minMaxOrigin"],
      table: minMaxOriginAttributes,
    },
    contrast("contrastEnhancement"),
    contrast("redContrastEnhancement"),
    contrast("greenContrastEnhancement"),
    contrast("blueContrastEnhancement"),
    {
      kind: "object",
      field: "transparency",
      at: ["rasterTransparency"],
      spec: {
        tag: "rasterTransparency",
        entries: [
          {
            kind: "records",
            field: "singleValuePixelList",
            table: pixelListEntryAttributes,
            at: ["singleValuePixelList"],
            item: "pixelListEntry",
          },
          {
            kind: "records",
            field: "threeValuePixelList",
            table: pixelListEntryAttributes,
            at: ["threeValuePixelList"],
            item: "pixelListEntry",
          },
        ],
      },
    },
    {
      kind: "object",
      field: "shader",
      at: ["rastershader", "colorrampshader"],
      spec: colorRampShaderSpec,
    },
    {
      kind: "records",
      field: "palette",
      table: paletteEntryAttributes,
      at: ["colorPalette"],
      item: "paletteEntry",
    },
    {
      kind: "object",
      field: "colorRamp",
      at: ["colorramp"],
      spec: colorRampSpec,
    },
    {
      kind: "attributes",
      field: "legend",
      table: rampLegendSettingsAttributes,
      at: ["rampLegendSettings"],
    },
  ],
};

/** Raster layer settings described declaratively. */
export const rasterLayerSpec: Spec = {
  tag: "maplayer",
  entries: [
    {
      kind: "dataDefined",
      field: "pipeDataDefinedProperties",
      tag: "pipe-data-defined-properties",
    },
    {
      kind: "object",
      field: "renderer",
      at: ["pipe", "rasterrenderer"],
      spec: rendererSpec,
    },
    {
      kind: "attributes",
      field: "brightnessContrast",
      table: brightnessContrastAttributes,
      at: ["pipe", "brightnesscontrast"],
    },
    {
      kind: "attributes",
      field: "hueSaturation",
      table: hueSaturationAttributes,
      at: ["pipe", "huesaturation"],
    },
    {
      kind: "attributes",
      field: "resampler",
      table: rasterResamplerAttributes,
      at: ["pipe", "rasterresampler"],
    },
    {
      kind: "text",
      field: "resamplingStage",
      at: ["pipe", "resamplingStage"],
      type: "string",
    },
    {
      kind: "attributes",
      field: "providerResampling",
      table: providerResamplingAttributes,
      at: ["pipe", "provider", "resampling"],
    },
    {
      kind: "records",
      field: "attributeTables",
      at: ["FileBasedAttributeTables"],
      item: "AttributeTable",
      table: rasterAttributeTableAttributes,
    },
    {
      kind: "owners",
      field: "noData",
      at: ["noData"],
      spec: {
        tag: "noDataList",
        entries: [
          attribute("band", "bandNo"),
          attribute("useSourceNoData", "useSrcNoData", "boolean"),
          {
            kind: "records",
            field: "ranges",
            table: noDataRangeAttributes,
            at: [],
            item: "noDataRange",
          },
        ],
      },
    },
  ],
};
