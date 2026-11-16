import { textFormatSpec } from "./labeling.ts";
import { customProperties } from "./layer-settings.ts";
import type { Entry, Spec } from "./spec.ts";

const attributes = (field: string, ...at: string[]): Entry => ({
  kind: "attributes",
  field,
  at,
});
const rest = (exclude: string[] = []): Entry => ({
  kind: "attributes",
  field: "attributes",
  exclude,
});
const format = (field: string, ...at: string[]): Entry => ({
  kind: "object",
  field,
  at: [...at, "text-style"],
  spec: textFormatSpec,
});
const symbolIn = (field: string, wrapper?: string): Entry => ({
  kind: "symbol",
  field,
  name: "",
  ...(wrapper ? { at: [wrapper] } : {}),
});

/** `<LayoutObject>`: data-defined and custom properties of layout objects. */
const layoutObject: Entry = {
  kind: "object",
  field: "layoutObject",
  at: ["LayoutObject"],
  spec: {
    tag: "LayoutObject",
    entries: [
      {
        kind: "dataDefined",
        field: "dataDefinedProperties",
        tag: "dataDefinedProperties",
      },
      { kind: "custom", field: "customProperties", custom: customProperties },
    ],
  },
};

const mapGrid: Spec = {
  tag: "ComposerMapGrid",
  entries: [
    rest(),
    symbolIn("lineSymbol", "lineStyle"),
    symbolIn("markerSymbol", "markerStyle"),
    format("format"),
    attributes("annotationFont", "annotationFontProperties"),
    layoutObject,
  ],
};

const mapOverview: Spec = {
  tag: "ComposerMapOverview",
  entries: [rest(), symbolIn("symbol"), layoutObject],
};

/** `<LayoutItem>`; QGIS reads the parts its item type uses. */
export const layoutItemSpec: Spec = {
  tag: "LayoutItem",
  entries: [
    { kind: "attribute", field: "type", attribute: "type", type: "string" },
    rest(["type"]),
    attributes("frameColor", "FrameColor"),
    attributes("backgroundColor", "BackgroundColor"),
    layoutObject,
    symbolIn("symbol"),
    format("format"),
    { kind: "extent", field: "extent", tag: "Extent" },
    { kind: "crs", field: "crs", tag: "crs" },
    {
      kind: "records",
      field: "layers",
      at: ["LayerSet"],
      item: "Layer",
      text: "id",
    },
    { kind: "owners", field: "grids", spec: mapGrid },
    { kind: "owners", field: "overviews", spec: mapOverview },
    attributes("atlasMap", "AtlasMap"),
    { kind: "records", field: "nodes", at: ["nodes"], item: "node" },
    {
      kind: "owners",
      field: "legendStyles",
      at: ["styles"],
      spec: {
        tag: "style",
        entries: [rest(), format("format")],
      },
    },
    symbolIn("lineSymbol", "lineSymbol"),
    symbolIn("divisionLineSymbol", "divisionLineSymbol"),
    symbolIn("subdivisionLineSymbol", "subdivisionLineSymbol"),
    symbolIn("fillSymbol1", "fillSymbol1"),
    symbolIn("fillSymbol2", "fillSymbol2"),
    attributes("strokeColor", "strokeColor"),
    attributes("fillColor", "fillColor"),
    attributes("fillColor2", "fillColor2"),
    attributes("itemClipping", "itemClippingSettings"),
    attributes("atlasClipping", "atlasClippingSettings"),
    {
      kind: "values",
      field: "atlasClippingLayers",
      at: ["atlasClippingSettings", "layersToClip"],
      item: "Layer",
    },
  ],
};

const tableColumn = (tag: string): Spec => ({
  tag,
  entries: [rest(), attributes("backgroundColor", "backgroundColor")],
});

/** `<LayoutMultiFrame>`, such as attribute tables and HTML frames. */
export const layoutMultiFrameSpec: Spec = {
  tag: "LayoutMultiFrame",
  entries: [
    { kind: "attribute", field: "type", attribute: "type", type: "string" },
    rest(["type"]),
    layoutObject,
    { kind: "records", field: "frames", at: [], item: "childFrame" },
    format("headerFormat", "headerTextFormat"),
    format("contentFormat", "contentTextFormat"),
    {
      kind: "owners",
      field: "columns",
      at: ["displayColumns"],
      spec: tableColumn("column"),
    },
    {
      kind: "owners",
      field: "sortColumns",
      at: ["sortColumns"],
      spec: tableColumn("column"),
    },
    {
      kind: "object",
      field: "cellStyles",
      at: ["cellStyles"],
      spec: {
        tag: "cellStyles",
        entries: [
          "oddColumns",
          "evenColumns",
          "oddRows",
          "evenRows",
          "firstColumn",
          "lastColumn",
          "headerRow",
          "firstRow",
          "lastRow",
        ].map((tag) => attributes(tag, tag)),
      },
    },
  ],
};

/** `<Layout>`: a print layout. */
export const layoutSpec: Spec = {
  tag: "Layout",
  entries: [
    { kind: "attribute", field: "name", attribute: "name", type: "string" },
    rest(["name"]),
    attributes("snapper", "Snapper"),
    attributes("grid", "Grid"),
    {
      kind: "owners",
      field: "pages",
      at: ["PageCollection"],
      spec: layoutItemSpec,
    },
    symbolIn("pageSymbol", "PageCollection"),
    {
      kind: "records",
      field: "guides",
      at: ["PageCollection", "GuideCollection"],
      item: "Guide",
    },
    { kind: "owners", field: "items", spec: layoutItemSpec },
    { kind: "owners", field: "multiFrames", spec: layoutMultiFrameSpec },
    attributes("atlas", "Atlas"),
    { kind: "custom", field: "customProperties", custom: customProperties },
  ],
};
