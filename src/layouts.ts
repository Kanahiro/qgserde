import {
  chartSeriesAttributes,
  fontAttributes,
  layerRefAttributes,
  layout3DTemporalAttributes,
  layoutAtlasAttributes,
  layoutAtlasMapAttributes,
  layoutAttributes,
  layoutChildFrameAttributes,
  layoutClippingAttributes,
  layoutColorAttributes,
  layoutGridAttributes,
  layoutGuideAttributes,
  layoutItemAttributes,
  layoutLayerStyleAttributes,
  layoutMapLayerAttributes,
  layoutMapOverviewAttributes,
  layoutMultiFrameAttributes,
  layoutNodeAttributes,
  layoutSnapperAttributes,
  layoutTableCellStyleAttributes,
  layoutTableColumnAttributes,
  legendStyleAttributes,
  legendTreeGroupAttributes,
  legendTreeLayerAttributes,
  mapGridAttributes,
  plotAttributes,
  plotAxisAttributes,
  profileCustomSourceAttributes,
  reportSectionAttributes,
  tableColumnWidthAttributes,
  tableRowHeightAttributes,
} from "./attributes.generated.ts";
import { textFormatSpec } from "./labeling.ts";
import { customProperties, numericFormat } from "./layer-settings.ts";
import { cameraPoseEntry, scene3DSpec } from "./scene3d.ts";
import type { AttributeTable, Entry, Spec } from "./spec.ts";

const attributes = (
  field: string,
  table: AttributeTable,
  ...at: string[]
): Entry => ({ kind: "attributes", field, table, at });
const rest = (table: AttributeTable, exclude: string[] = []): Entry => ({
  kind: "attributes",
  field: "attributes",
  table,
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
    rest(mapGridAttributes),
    symbolIn("lineSymbol", "lineStyle"),
    symbolIn("markerSymbol", "markerStyle"),
    format("format"),
    attributes("annotationFont", fontAttributes, "annotationFontProperties"),
    layoutObject,
  ],
};

const mapOverview: Spec = {
  tag: "ComposerMapOverview",
  entries: [
    rest(layoutMapOverviewAttributes),
    symbolIn("symbol"),
    layoutObject,
  ],
};

const treeProperties: Entry = {
  kind: "custom",
  field: "customProperties",
  custom: customProperties,
};
/** Layer tree of a layout legend or an elevation profile. */
export const legendGroup: Spec = {
  tag: "layer-tree-group",
  entries: [rest(legendTreeGroupAttributes), treeProperties],
};
const legendLayer: Spec = {
  tag: "layer-tree-layer",
  entries: [rest(legendTreeLayerAttributes), treeProperties],
};
(legendGroup.entries as Entry[]).push({
  kind: "nodes",
  field: "children",
  specs: { group: legendGroup, layer: legendLayer },
});

const indexedSymbols = (
  field: string,
  container: string,
  tag: string,
): Entry => ({
  kind: "owners",
  field,
  at: [container],
  spec: {
    tag,
    entries: [
      { kind: "attribute", field: "index", attribute: "index", type: "number" },
      symbolIn("symbol"),
    ],
  },
});

const plotAxis = (field: string, tag: string): Entry => ({
  kind: "object",
  field,
  at: [tag],
  spec: {
    tag,
    entries: [
      rest(plotAxisAttributes),
      numericFormat("numericFormat", "numericFormat"),
      symbolIn("gridMajorSymbol", "gridMajorSymbol"),
      symbolIn("gridMinorSymbol", "gridMinorSymbol"),
      format("textFormat", "textFormat"),
    ],
  },
});

/** `<plot>` of elevation profiles and charts. */
const plot: Entry = {
  kind: "object",
  field: "plot",
  at: ["plot"],
  spec: {
    tag: "plot",
    entries: [
      rest(plotAttributes),
      {
        kind: "dataDefined",
        field: "dataDefinedProperties",
        tag: "dataDefinedProperties",
      },
      plotAxis("xAxis", "xAxis"),
      plotAxis("yAxis", "yAxis"),
      symbolIn("backgroundSymbol", "backgroundSymbol"),
      symbolIn("borderSymbol", "borderSymbol"),
      indexedSymbols("fillSymbols", "fillSymbols", "fillSymbol"),
      indexedSymbols("lineSymbols", "lineSymbols", "lineSymbol"),
      indexedSymbols("markerSymbols", "markerSymbols", "markerSymbol"),
      {
        kind: "owners",
        field: "colorRamps",
        at: ["colorRamps"],
        spec: {
          tag: "colorRamp",
          entries: [
            {
              kind: "attribute",
              field: "index",
              attribute: "index",
              type: "number",
            },
            {
              kind: "object",
              field: "colorRamp",
              at: ["colorramp"],
              spec: {
                tag: "colorramp",
                entries: [
                  {
                    kind: "attribute",
                    field: "type",
                    attribute: "type",
                    type: "string",
                  },
                  { kind: "properties", field: "properties" },
                ],
              },
            },
          ],
        },
      },
      format("textFormat", "textFormat"),
      numericFormat("numericFormat", "numericFormat"),
    ],
  },
};

/** `<LayoutItem>`; QGIS reads the parts its item type uses. */
export const layoutItemSpec: Spec = {
  tag: "LayoutItem",
  entries: [
    { kind: "attribute", field: "type", attribute: "type", type: "string" },
    rest(layoutItemAttributes, ["type"]),
    attributes("frameColor", layoutColorAttributes, "FrameColor"),
    attributes("backgroundColor", layoutColorAttributes, "BackgroundColor"),
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
      table: layoutMapLayerAttributes,
    },
    { kind: "owners", field: "grids", spec: mapGrid },
    { kind: "owners", field: "overviews", spec: mapOverview },
    attributes("atlasMap", layoutAtlasMapAttributes, "AtlasMap"),
    {
      kind: "records",
      field: "layerStyleOverrides",
      at: ["LayerStyles"],
      item: "LayerStyle",
      table: layoutLayerStyleAttributes,
    },
    {
      kind: "values",
      field: "labelBlockingItems",
      at: ["labelBlockingItems"],
      item: "item",
      attribute: "uuid",
    },
    {
      kind: "values",
      field: "groupItems",
      at: [],
      item: "ComposerItemGroupElement",
      attribute: "uuid",
    },
    {
      kind: "values",
      field: "filterByMaps",
      at: ["filterByMaps"],
      item: "map",
      attribute: "uuid",
    },
    numericFormat("numericFormat", "numericFormat"),
    plot,
    { kind: "object", field: "scene3D", at: ["qgis3d"], spec: scene3DSpec },
    cameraPoseEntry,
    attributes(
      "temporalSettings3D",
      layout3DTemporalAttributes,
      "temporal-settings",
    ),
    { kind: "text", field: "curve", at: ["curve"], type: "string" },
    {
      kind: "records",
      field: "profileLayers",
      at: ["layers"],
      item: "layer",
      table: layerRefAttributes,
    },
    {
      kind: "nodes",
      field: "profileSources",
      at: ["profileSources"],
      specs: {
        layer: {
          tag: "profileLayerSource",
          entries: [rest(layerRefAttributes)],
        },
        custom: {
          tag: "profileCustomSource",
          entries: [rest(profileCustomSourceAttributes)],
        },
      },
    },
    {
      kind: "symbol",
      field: "subsectionsSymbol",
      name: "subsections",
      at: ["subsections"],
    },
    {
      kind: "records",
      field: "series",
      at: ["seriesList"],
      item: "series",
      table: chartSeriesAttributes,
    },
    {
      kind: "records",
      field: "nodes",
      at: ["nodes"],
      item: "node",
      table: layoutNodeAttributes,
    },
    {
      kind: "owners",
      field: "legendStyles",
      at: ["styles"],
      spec: {
        tag: "style",
        entries: [rest(legendStyleAttributes), format("format")],
      },
    },
    symbolIn("lineSymbol", "lineSymbol"),
    symbolIn("divisionLineSymbol", "divisionLineSymbol"),
    symbolIn("subdivisionLineSymbol", "subdivisionLineSymbol"),
    symbolIn("fillSymbol1", "fillSymbol1"),
    symbolIn("fillSymbol2", "fillSymbol2"),
    {
      kind: "object",
      field: "legendTree",
      at: ["layer-tree-group"],
      spec: legendGroup,
    },
    attributes("strokeColor", layoutColorAttributes, "strokeColor"),
    attributes("fillColor", layoutColorAttributes, "fillColor"),
    attributes("fillColor2", layoutColorAttributes, "fillColor2"),
    attributes(
      "itemClipping",
      layoutClippingAttributes,
      "itemClippingSettings",
    ),
    attributes(
      "atlasClipping",
      layoutClippingAttributes,
      "atlasClippingSettings",
    ),
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
  entries: [
    rest(layoutTableColumnAttributes),
    attributes("backgroundColor", layoutColorAttributes, "backgroundColor"),
  ],
});

/** `<LayoutMultiFrame>`, such as attribute tables and HTML frames. */
export const layoutMultiFrameSpec: Spec = {
  tag: "LayoutMultiFrame",
  entries: [
    { kind: "attribute", field: "type", attribute: "type", type: "string" },
    rest(layoutMultiFrameAttributes, ["type"]),
    layoutObject,
    {
      kind: "records",
      field: "frames",
      at: [],
      item: "childFrame",
      table: layoutChildFrameAttributes,
    },
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
      kind: "owners",
      field: "headers",
      at: ["headers"],
      spec: tableColumn("header"),
    },
    {
      kind: "owners",
      field: "rows",
      at: ["contents"],
      spec: {
        tag: "row",
        entries: [{ kind: "variants", field: "cells", at: [] }],
      },
    },
    {
      kind: "records",
      field: "rowHeights",
      at: ["rowHeights"],
      item: "row",
      table: tableRowHeightAttributes,
    },
    {
      kind: "records",
      field: "columnWidths",
      at: ["columnWidths"],
      item: "column",
      table: tableColumnWidthAttributes,
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
        ].map((tag) => attributes(tag, layoutTableCellStyleAttributes, tag)),
      },
    },
  ],
};

/** Report `<Section>`; its header, footer, and body are layouts. */
const reportSection: Spec = { tag: "Section", entries: [] };
const sectionLayout = (field: string, wrapper: string): Entry => ({
  kind: "owner",
  field,
  at: [wrapper],
  spec: layoutSpec,
});
/** `<Report>`: a report of nested sections. */
export const reportSpec: Spec = {
  tag: "Report",
  entries: [
    { kind: "attribute", field: "name", attribute: "name", type: "string" },
    { kind: "owner", field: "section", spec: reportSection },
  ],
};

/** `<Layout>`: a print layout. */
export const layoutSpec: Spec = {
  tag: "Layout",
  entries: [
    { kind: "attribute", field: "name", attribute: "name", type: "string" },
    rest(layoutAttributes, ["name"]),
    attributes("snapper", layoutSnapperAttributes, "Snapper"),
    attributes("grid", layoutGridAttributes, "Grid"),
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
      table: layoutGuideAttributes,
    },
    { kind: "owners", field: "items", spec: layoutItemSpec },
    { kind: "owners", field: "multiFrames", spec: layoutMultiFrameSpec },
    attributes("atlas", layoutAtlasAttributes, "Atlas"),
    { kind: "custom", field: "customProperties", custom: customProperties },
  ],
};

(reportSection.entries as Entry[]).push(
  attributes("attributes", reportSectionAttributes),
  sectionLayout("header", "header"),
  sectionLayout("footer", "footer"),
  sectionLayout("body", "body"),
  { kind: "owners", field: "children", spec: reportSection },
);
