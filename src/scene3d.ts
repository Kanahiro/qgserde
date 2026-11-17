import {
  category3DAttributes,
  material3DAttributes,
  mesh3DAdvancedAttributes,
  pointCloud3DCategoryAttributes,
  polygonEdges3DAttributes,
  renderer3DAttributes,
  rule3DAttributes,
  symbol3DAttributes,
  symbol3DDataAttributes,
  symbol3DTransformAttributes,
  tiling3DAttributes,
} from "./attributes.generated.ts";
import { colorRampShaderSpec } from "./raster.ts";
import type { Entry, Spec } from "./spec.ts";

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
