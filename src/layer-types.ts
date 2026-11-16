import { ensure, remove } from "./codec.ts";
import { labelSettingsSpec, textFormatSpec } from "./labeling.ts";
import { colorRampShaderSpec, contrast } from "./raster.ts";
import {
  type Custom,
  captureSpec,
  type Entry,
  readSpec,
  restoreSpec,
  type Spec,
  union,
  writeSpec,
} from "./spec.ts";
import type { XmlElement } from "./types.ts";
import { findChild } from "./xml.ts";

const attributes = (field: string, ...at: string[]): Entry => ({
  kind: "attributes",
  field,
  at,
});
const type: Entry = {
  kind: "attribute",
  field: "type",
  attribute: "type",
  type: "string",
};
const otherAttributes: Entry = {
  kind: "attributes",
  field: "attributes",
  exclude: ["type"],
};
const symbolIn = (field: string, wrapper: string): Entry => ({
  kind: "symbol",
  field,
  name: "",
  at: [wrapper],
});

/** Paint effect stored inside `<paintEffect>`. */
export const paintEffectEntry = (
  effect: Entry & { kind: "object" },
): Entry => ({
  ...effect,
  at: ["paintEffect", "effect"],
});

export const vectorTileEntries: Entry[] = [
  {
    kind: "custom",
    field: "renderer",
    custom: union("renderer", {
      basic: {
        tag: "renderer",
        entries: [
          type,
          {
            kind: "owners",
            field: "styles",
            at: ["styles"],
            spec: {
              tag: "style",
              entries: [
                { kind: "attributes", field: "attributes" },
                { kind: "symbol", field: "symbol", name: "0", at: ["symbols"] },
              ],
            },
          },
        ],
      },
    }),
  },
  {
    kind: "custom",
    field: "labeling",
    custom: union("labeling", {
      basic: {
        tag: "labeling",
        entries: [
          type,
          otherAttributes,
          {
            kind: "owners",
            field: "styles",
            at: ["styles"],
            spec: {
              tag: "style",
              entries: [
                { kind: "attributes", field: "attributes" },
                {
                  kind: "object",
                  field: "settings",
                  at: ["settings"],
                  spec: labelSettingsSpec,
                },
              ],
            },
          },
        ],
      },
    }),
  },
];

function datasetGroupItem(): Spec {
  const entries: Entry[] = [{ kind: "attributes", field: "attributes" }];
  const spec: Spec = { tag: "mesh-dataset-group-tree-item", entries };
  entries.push({ kind: "owners", field: "children", spec });
  return spec;
}

export const meshEntries: Entry[] = [
  {
    kind: "object",
    field: "renderer",
    at: ["mesh-renderer-settings"],
    spec: {
      tag: "mesh-renderer-settings",
      entries: [
        attributes("activeDatasetGroup", "active-dataset-group"),
        {
          kind: "owners",
          field: "scalarSettings",
          spec: {
            tag: "scalar-settings",
            entries: [
              { kind: "attributes", field: "attributes" },
              {
                kind: "object",
                field: "shader",
                at: ["colorrampshader"],
                spec: colorRampShaderSpec,
              },
              attributes("edge", "edge-settings"),
              attributes(
                "edgeStrokeWidth",
                "edge-settings",
                "mesh-stroke-width",
              ),
            ],
          },
        },
        {
          kind: "owners",
          field: "vectorSettings",
          spec: {
            tag: "vector-settings",
            entries: [{ kind: "attributes", field: "attributes" }],
          },
        },
        attributes("nativeMesh", "mesh-settings-native"),
        attributes("triangularMesh", "mesh-settings-triangular"),
        attributes("edgeMesh", "mesh-settings-edge"),
        attributes("averaging", "averaging-3d"),
        attributes("averagingSigma", "averaging-3d", "sigma-settings"),
      ],
    },
  },
  attributes("staticActiveDataset", "static-active-dataset"),
  {
    kind: "object",
    field: "datasetGroups",
    at: ["mesh-dataset-groups-store"],
    spec: {
      tag: "mesh-dataset-groups-store",
      entries: [
        { kind: "owners", field: "tree", spec: datasetGroupItem() },
        { kind: "records", field: "datasets", at: [], item: "mesh-dataset" },
        {
          kind: "records",
          field: "nameToGlobalIndex",
          at: [],
          item: "name-to-global-index",
        },
      ],
    },
  },
  attributes("simplify", "mesh-simplify-settings"),
];

const formatWrappers = ["pointTextFormat", "lineTextFormat", "rectTextFormat"];

function formatElement(element: XmlElement): XmlElement | undefined {
  for (const tag of formatWrappers) {
    const wrapper = findChild(element, tag);
    const style = wrapper && findChild(wrapper, "text-style");
    if (style) return style;
  }
  return undefined;
}

/** Text format inside the item type's wrapper, such as `<pointTextFormat>`. */
const annotationFormat: Custom = {
  read(element, codec) {
    const style = formatElement(element);
    return style && readSpec(textFormatSpec, style, codec);
  },
  capture(value, element, codec, path) {
    const style = formatElement(element);
    if (style && value)
      captureSpec(textFormatSpec, value as never, style, codec, path);
  },
  restore(value, codec, version) {
    if (value) restoreSpec(textFormatSpec, value as never, codec, version, 0);
  },
  write(value, element, codec, target) {
    const existing = formatWrappers
      .map((tag) => findChild(element, tag))
      .find((wrapper) => wrapper !== undefined);
    if (value === undefined) {
      if (existing) remove(element, existing.name);
      return;
    }
    const type = element.attributes.type;
    const tag =
      existing?.name ??
      (type === "linetext"
        ? "lineTextFormat"
        : type === "recttext"
          ? "rectTextFormat"
          : "pointTextFormat");
    writeSpec(
      textFormatSpec,
      value as never,
      ensure(ensure(element, tag), "text-style"),
      codec,
      target,
    );
  },
};

/** Annotation item; QGIS stores only the parts its item type uses. */
export const annotationItemSpec: Spec = {
  tag: "item",
  entries: [
    { kind: "attributes", field: "attributes" },
    { kind: "symbol", field: "markerSymbol", name: "markerSymbol" },
    { kind: "symbol", field: "lineSymbol", name: "lineSymbol" },
    { kind: "symbol", field: "fillSymbol", name: "fillSymbol" },
    { kind: "custom", field: "format", custom: annotationFormat },
  ],
};

export const annotationEntries: Entry[] = [
  { kind: "owners", field: "items", at: ["items"], spec: annotationItemSpec },
];

export const groupEntries: Entry[] = [
  {
    kind: "values",
    field: "childLayers",
    at: ["childLayers"],
    item: "child",
    attribute: "layerid",
  },
];

export const pointCloudEntries: Entry[] = [
  {
    kind: "object",
    field: "renderer",
    at: ["renderer"],
    spec: {
      tag: "renderer",
      entries: [
        type,
        otherAttributes,
        {
          kind: "records",
          field: "categories",
          at: ["categories"],
          item: "category",
        },
        {
          kind: "object",
          field: "shader",
          at: ["colorrampshader"],
          spec: colorRampShaderSpec,
        },
        contrast("redContrastEnhancement"),
        contrast("greenContrastEnhancement"),
        contrast("blueContrastEnhancement"),
      ],
    },
  },
];

export const tiledSceneEntries: Entry[] = [
  {
    kind: "object",
    field: "renderer",
    at: ["renderer"],
    spec: {
      tag: "renderer",
      entries: [
        type,
        otherAttributes,
        symbolIn("fillSymbol", "fillSymbol"),
        symbolIn("lineSymbol", "lineSymbol"),
      ],
    },
  },
];
