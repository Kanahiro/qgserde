import {
  commonLayerEntries,
  customProperties,
  metadataBase,
  relationSpec,
} from "./layer-settings.ts";
import { annotationEntries } from "./layer-types.ts";
import { layoutSpec } from "./layouts.ts";
import { projectProperties } from "./properties.ts";
import type { Entry, Spec } from "./spec.ts";

const attributes = (field: string, ...at: string[]): Entry => ({
  kind: "attributes",
  field,
  at,
});

const legendNodes = (container: string, item: string): Spec => ({
  tag: container,
  entries: [
    { kind: "attribute", field: "layerId", attribute: "id", type: "string" },
    { kind: "values", field: "nodes", at: [], item, attribute: "id" },
  ],
});

const numericFormat = (field: string, tag: string): Entry => ({
  kind: "object",
  field,
  at: [tag],
  spec: {
    tag,
    entries: [
      { kind: "attribute", field: "id", attribute: "id", type: "string" },
      { kind: "variant", field: "settings", at: ["Option"] },
    ],
  },
});

const annotationItem: Spec = {
  tag: "AnnotationItem",
  entries: [
    { kind: "attributes", field: "attributes" },
    { kind: "crs", field: "crs", tag: "" },
    { kind: "symbol", field: "markerSymbol", name: "marker symbol" },
    {
      kind: "symbol",
      field: "fillSymbol",
      name: "fill symbol",
      at: ["fillSymbol"],
    },
  ],
};
const canvasAnnotation = (tag: string): Spec => ({
  tag,
  entries: [
    { kind: "attributes", field: "attributes" },
    {
      kind: "object",
      field: "item",
      at: ["AnnotationItem"],
      spec: annotationItem,
    },
  ],
});

const legacyLegendEntries: Entry[] = [
  { kind: "attributes", field: "attributes" },
];
const legacyLegendGroup: Spec = {
  tag: "legendgroup",
  entries: legacyLegendEntries,
};
const legacyLegendLayer: Spec = {
  tag: "legendlayer",
  entries: [
    { kind: "attributes", field: "attributes" },
    attributes("fileGroup", "filegroup"),
    {
      kind: "records",
      field: "files",
      at: ["filegroup"],
      item: "legendlayerfile",
    },
  ],
};
const legacyLegendNodes: Entry = {
  kind: "nodes",
  field: "children",
  specs: { group: legacyLegendGroup, layer: legacyLegendLayer },
};
legacyLegendEntries.push(legacyLegendNodes);

/** Project-level settings described declaratively. */
export const projectSpec: Spec = {
  tag: "qgis",
  entries: [
    {
      kind: "attributes",
      field: "attributes",
      exclude: ["version", "projectname"],
    },
    { kind: "custom", field: "properties", custom: projectProperties },
    { kind: "owners", field: "layouts", at: ["Layouts"], spec: layoutSpec },
    {
      kind: "nodes",
      field: "annotations",
      at: ["Annotations"],
      specs: {
        text: canvasAnnotation("TextAnnotationItem"),
        svg: canvasAnnotation("SVGAnnotationItem"),
        html: canvasAnnotation("HtmlAnnotationItem"),
        form: canvasAnnotation("FormAnnotationItem"),
      },
    },
    {
      kind: "object",
      field: "mainAnnotationLayer",
      at: ["main-annotation-layer"],
      spec: {
        tag: "main-annotation-layer",
        entries: [
          { kind: "text", field: "id", at: ["id"], type: "string" },
          { kind: "text", field: "name", at: ["layername"], type: "string" },
          { kind: "crs", field: "crs", tag: "srs" },
          {
            kind: "text",
            field: "opacity",
            at: ["layerOpacity"],
            type: "number",
          },
          ...annotationEntries,
          ...commonLayerEntries,
        ],
      },
    },
    {
      kind: "attribute",
      field: "transactionMode",
      attribute: "mode",
      type: "string",
      at: ["transaction"],
    },
    {
      kind: "attribute",
      field: "projectFlags",
      attribute: "set",
      type: "string",
      at: ["projectFlags"],
    },
    {
      kind: "owners",
      field: "relations",
      at: ["relations"],
      spec: relationSpec,
    },
    {
      kind: "owners",
      field: "polymorphicRelations",
      at: ["polymorphicRelations"],
      spec: { ...relationSpec, tag: "polymorphicRelation" },
    },
    {
      kind: "owners",
      field: "mapThemes",
      at: ["visibility-presets"],
      spec: {
        tag: "visibility-preset",
        entries: [
          {
            kind: "attribute",
            field: "name",
            attribute: "name",
            type: "string",
          },
          { kind: "attributes", field: "attributes" },
          { kind: "records", field: "layers", at: [], item: "layer" },
          {
            kind: "owners",
            field: "checkedLegendNodes",
            at: ["checked-legend-nodes"],
            spec: legendNodes("checked-legend-nodes", "checked-legend-node"),
          },
          {
            kind: "owners",
            field: "expandedLegendNodes",
            spec: legendNodes("expanded-legend-nodes", "expanded-legend-node"),
          },
          {
            kind: "values",
            field: "checkedGroupNodes",
            at: ["checked-group-nodes"],
            item: "checked-group-node",
            attribute: "id",
          },
          {
            kind: "values",
            field: "expandedGroupNodes",
            at: ["expanded-group-nodes"],
            item: "expanded-group-node",
            attribute: "id",
          },
        ],
      },
    },
    {
      kind: "owners",
      field: "bookmarks",
      at: ["Bookmarks"],
      spec: {
        tag: "Bookmark",
        entries: [
          { kind: "attributes", field: "attributes" },
          { kind: "crs", field: "crs", tag: "" },
        ],
      },
    },
    {
      kind: "owners",
      field: "transformContext",
      at: ["transformContext"],
      spec: {
        tag: "srcDest",
        entries: [
          { kind: "attributes", field: "attributes" },
          { kind: "crs", field: "source", tag: "src" },
          { kind: "crs", field: "destination", tag: "dest" },
        ],
      },
    },
    {
      kind: "object",
      field: "snapping",
      at: ["snapping-settings"],
      spec: {
        tag: "snapping-settings",
        entries: [
          { kind: "attributes", field: "attributes" },
          {
            kind: "records",
            field: "layers",
            at: ["individual-layer-settings"],
            item: "layer-setting",
          },
        ],
      },
    },
    {
      kind: "dataDefined",
      field: "dataDefinedServerProperties",
      tag: "dataDefinedServerProperties",
    },
    attributes("elevationShading", "elevation-shading-renderer"),
    {
      kind: "object",
      field: "legacyLegend",
      at: ["legend"],
      spec: {
        tag: "legend",
        entries: [
          { kind: "attributes", field: "attributes" },
          legacyLegendNodes,
        ],
      },
    },
    attributes("autoTransaction", "autotransaction"),
    attributes("evaluateDefaultValues", "evaluateDefaultValues"),
    attributes("trust", "trust"),
    {
      kind: "text",
      field: "canvasUnits",
      at: ["mapcanvas", "units"],
      type: "string",
    },
    {
      kind: "attribute",
      field: "useProjectScales",
      attribute: "UseProjectScales",
      type: "boolean",
      at: ["ProjectViewSettings"],
    },
    {
      kind: "values",
      field: "scales",
      at: ["ProjectViewSettings", "Scales"],
      item: "Scale",
      attribute: "Value",
    },
    {
      kind: "object",
      field: "styleSettings",
      at: ["ProjectStyleSettings"],
      spec: {
        tag: "ProjectStyleSettings",
        entries: [
          { kind: "attributes", field: "attributes" },
          {
            kind: "values",
            field: "databases",
            at: ["databases"],
            item: "db",
            attribute: "path",
          },
        ],
      },
    },
    {
      kind: "object",
      field: "timeSettings",
      at: ["ProjectTimeSettings"],
      spec: {
        tag: "ProjectTimeSettings",
        entries: [
          { kind: "attributes", field: "attributes" },
          { kind: "texts", field: "range", at: ["TemporalRange"] },
        ],
      },
    },
    {
      kind: "object",
      field: "elevationProperties",
      at: ["ElevationProperties"],
      spec: {
        tag: "ElevationProperties",
        entries: [
          { kind: "attributes", field: "attributes" },
          {
            kind: "attribute",
            field: "terrainProviderType",
            attribute: "type",
            type: "string",
            at: ["terrainProvider"],
          },
          attributes("terrainProvider", "terrainProvider", "TerrainProvider"),
        ],
      },
    },
    {
      kind: "object",
      field: "displaySettings",
      at: ["ProjectDisplaySettings"],
      spec: {
        tag: "ProjectDisplaySettings",
        entries: [
          { kind: "attributes", field: "attributes" },
          numericFormat("bearingFormat", "BearingFormat"),
          numericFormat(
            "geographicCoordinateFormat",
            "GeographicCoordinateFormat",
          ),
          { kind: "crs", field: "customCrs", tag: "CoordinateCustomCrs" },
        ],
      },
    },
    {
      kind: "object",
      field: "gpsSettings",
      at: ["ProjectGpsSettings"],
      spec: {
        tag: "ProjectGpsSettings",
        entries: [
          { kind: "attributes", field: "attributes" },
          {
            kind: "records",
            field: "timeStampFields",
            at: ["timeStampFields"],
            item: "field",
          },
        ],
      },
    },
  ],
};

/** Metadata beyond the hand-written project metadata fields. */
export const projectMetadataSpec: Spec = {
  tag: "projectMetadata",
  entries: metadataBase,
};

/** Layer-tree node settings beyond the hand-written ones. */
export function treeNodeSpec(group: boolean): Spec {
  return {
    tag: group ? "layer-tree-group" : "layer-tree-layer",
    entries: [
      {
        kind: "attributes",
        field: "attributes",
        exclude: group
          ? ["name", "checked", "expanded"]
          : ["id", "name", "source", "providerKey", "checked", "expanded"],
      },
      { kind: "custom", field: "customProperties", custom: customProperties },
    ],
  };
}
