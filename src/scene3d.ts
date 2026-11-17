import {
  ambientOcclusion3DAttributes,
  animation3DAttributes,
  axis3DAttributes,
  background3DAttributes,
  bloom3DAttributes,
  cameraPoseAttributes,
  category3DAttributes,
  colorGrading3DAttributes,
  debug3DAttributes,
  debugSettings3DAttributes,
  directionalLight3DAttributes,
  eyeDome3DAttributes,
  keyframe3DAttributes,
  mapOverlay3DAttributes,
  mapView3DAttributes,
  material3DAttributes,
  mesh3DAdvancedAttributes,
  navigationSync3DAttributes,
  pointCloud3DCategoryAttributes,
  pointLight3DAttributes,
  polygonEdges3DAttributes,
  renderer3DAttributes,
  rule3DAttributes,
  scene3DCameraAttributes,
  scene3DColorAttributes,
  scene3DExtentAttributes,
  scene3DGeneratorAttributes,
  scene3DOriginAttributes,
  scene3DTerrainAttributes,
  shadow3DAttributes,
  symbol3DAttributes,
  symbol3DDataAttributes,
  symbol3DTransformAttributes,
  temporalRange3DAttributes,
  tiling3DAttributes,
} from "./attributes.generated.ts";
import { colorRampShaderSpec } from "./raster.ts";
import type { AttributeTable, Entry, Spec } from "./spec.ts";

/** `<colorramp>` stored by name, such as a categorized renderer's source ramp. */
export const colorRampEntry: Entry = {
  kind: "object",
  field: "colorRamp",
  at: ["colorramp"],
  spec: {
    tag: "colorramp",
    entries: [
      { kind: "attribute", field: "type", attribute: "type", type: "string" },
      { kind: "properties", field: "properties" },
    ],
  },
};

/** 3D symbol, stored as `<tag type>`; each type uses some of these parts. */
const symbol3DSpec = (tag: string): Spec => ({
  tag,
  entries: [
    { kind: "attributes", field: "attributes", table: symbol3DAttributes },
    {
      kind: "attributes",
      field: "data",
      table: symbol3DDataAttributes,
      at: ["data"],
    },
    {
      kind: "attributes",
      field: "material",
      table: material3DAttributes,
      at: ["material"],
    },
    {
      kind: "dataDefined",
      field: "dataDefinedProperties",
      tag: "data-defined-properties",
    },
    {
      kind: "attributes",
      field: "edges",
      table: polygonEdges3DAttributes,
      at: ["edges"],
    },
    {
      kind: "variant",
      field: "shapeProperties",
      at: ["shape-properties", "Option"],
    },
    {
      kind: "attributes",
      field: "transform",
      table: symbol3DTransformAttributes,
      at: ["transform"],
    },
    {
      kind: "attributes",
      field: "advanced",
      table: mesh3DAdvancedAttributes,
      at: ["advanced-settings"],
    },
    {
      kind: "object",
      field: "shader",
      at: ["colorrampshader"],
      spec: colorRampShaderSpec,
    },
    {
      kind: "records",
      field: "categories",
      at: ["categories"],
      item: "category",
      table: pointCloud3DCategoryAttributes,
    },
  ],
});

const symbolEntry = (field: string, tag: string): Entry => ({
  kind: "object",
  field,
  at: [tag],
  spec: symbol3DSpec(tag),
});

function ruleSpec(tag: string): Spec {
  const entries: Entry[] = [
    { kind: "attributes", field: "attributes", table: rule3DAttributes },
    symbolEntry("symbol", "symbol"),
  ];
  const spec: Spec = { tag, entries };
  entries.push({ kind: "owners", field: "children", spec: childRule });
  return spec;
}
const childRule: Spec = { tag: "rule", entries: [] };
(childRule.entries as Entry[]).push(...ruleSpec("rule").entries);

/** `<renderer-3d>` of a layer; each renderer type uses some of these parts. */
export const renderer3DSpec: Spec = {
  tag: "renderer-3d",
  entries: [
    { kind: "attribute", field: "type", attribute: "type", type: "string" },
    {
      kind: "attributes",
      field: "attributes",
      table: renderer3DAttributes,
      exclude: ["type"],
    },
    {
      kind: "attributes",
      field: "tiling",
      table: tiling3DAttributes,
      at: ["vector-layer-3d-tiling"],
    },
    symbolEntry("symbol", "symbol"),
    {
      kind: "object",
      field: "rootRule",
      at: ["rules"],
      spec: ruleSpec("rules"),
    },
    {
      kind: "owners",
      field: "categories",
      at: ["categories"],
      spec: {
        tag: "category",
        entries: [
          {
            kind: "attributes",
            field: "attributes",
            table: category3DAttributes,
          },
          { kind: "variant", field: "value", at: ["Option"] },
          symbolEntry("symbol", "symbol"),
        ],
      },
    },
    symbolEntry("sourceSymbol", "source-symbol"),
    colorRampEntry,
  ],
};

const group = (
  field: string,
  table: AttributeTable,
  ...at: string[]
): Entry => ({ kind: "attributes", field, table, at });

/** `<qgis3d>`: settings of a 3D map view or layout 3D map. */
export const scene3DSpec: Spec = {
  tag: "qgis3d",
  entries: [
    group("origin", scene3DOriginAttributes, "origin"),
    group("extent", scene3DExtentAttributes, "extent"),
    group("camera", scene3DCameraAttributes, "camera"),
    group("color", scene3DColorAttributes, "color"),
    { kind: "crs", field: "crs", tag: "crs" },
    group("terrain", scene3DTerrainAttributes, "terrain"),
    group(
      "terrainShadingMaterial",
      material3DAttributes,
      "terrain",
      "shading-material",
    ),
    {
      kind: "values",
      field: "layers",
      at: ["terrain", "layers"],
      item: "layer",
      attribute: "id",
    },
    group(
      "terrainGenerator",
      scene3DGeneratorAttributes,
      "terrain",
      "generator",
    ),
    {
      kind: "nodes",
      field: "lights",
      at: ["lights"],
      specs: {
        point: {
          tag: "point-light",
          entries: [group("attributes", pointLight3DAttributes)],
        },
        directional: {
          tag: "directional-light",
          entries: [group("attributes", directionalLight3DAttributes)],
        },
      },
    },
    group("background", background3DAttributes, "background"),
    group("skybox", background3DAttributes, "skybox"),
    group("shadows", shadow3DAttributes, "shadow-rendering"),
    group(
      "ambientOcclusion",
      ambientOcclusion3DAttributes,
      "screen-space-ambient-occlusion",
    ),
    group("bloom", bloom3DAttributes, "bloom"),
    group("colorGrading", colorGrading3DAttributes, "color-grading"),
    group("debug", debug3DAttributes, "debug"),
    group("eyeDomeLighting", eyeDome3DAttributes, "eye-dome-lighting"),
    group("navigationSync", navigationSync3DAttributes, "navigation-sync"),
    group("debugSettings", debugSettings3DAttributes, "debug-settings"),
    group("temporalRange", temporalRange3DAttributes, "temporal-range"),
    group("axis", axis3DAttributes, "axis3d"),
    group("mapOverlay", mapOverlay3DAttributes, "map-overlay"),
  ],
};

/** `<camera-pose>` of a 3D view or layout 3D map. */
export const cameraPoseEntry: Entry = group(
  "cameraPose",
  cameraPoseAttributes,
  "camera-pose",
);

/** `<mapViewDocks3D>`: the project's 3D map views. */
export const mapViews3DEntry: Entry = {
  kind: "owners",
  field: "mapViews3D",
  at: ["mapViewDocks3D"],
  spec: {
    tag: "view",
    entries: [
      group("attributes", mapView3DAttributes),
      { kind: "object", field: "settings", at: ["qgis3d"], spec: scene3DSpec },
      cameraPoseEntry,
      group("animation", animation3DAttributes, "animation3d"),
      {
        kind: "records",
        field: "keyframes",
        at: ["animation3d", "keyframes"],
        item: "keyframe",
        table: keyframe3DAttributes,
      },
    ],
  },
};
