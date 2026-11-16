import { type Entry, type Spec, union } from "./spec.ts";
import { effectSpec } from "./symbology.ts";

const effectIn = (field: string, wrapper: string): Entry => ({
  kind: "object",
  field,
  at: [wrapper, "effect"],
  spec: effectSpec,
});

const rule = (
  field: string,
  attribute: string,
  type: "string" | "number" | "boolean",
): Entry => ({ kind: "attribute", field, attribute, type });

/** `<text-style>` as written by QgsTextFormat; also used outside labeling. */
export const textFormatSpec: Spec = {
  tag: "text-style",
  entries: [
    // Label settings store these on the same element.
    {
      kind: "attributes",
      field: "style",
      exclude: ["fieldName", "isExpression"],
    },
    {
      kind: "values",
      field: "families",
      at: ["families"],
      item: "family",
      attribute: "name",
    },
    {
      kind: "records",
      field: "tabPositions",
      at: ["tabPositions"],
      item: "tab",
    },
    { kind: "attributes", field: "buffer", at: ["text-buffer"] },
    effectIn("bufferEffect", "text-buffer"),
    { kind: "attributes", field: "mask", at: ["text-mask"] },
    effectIn("maskEffect", "text-mask"),
    {
      kind: "object",
      field: "background",
      at: ["background"],
      spec: {
        tag: "background",
        entries: [
          { kind: "attributes", field: "attributes" },
          { kind: "symbol", field: "markerSymbol", name: "markerSymbol" },
          { kind: "symbol", field: "fillSymbol", name: "fillSymbol" },
        ],
      },
    },
    effectIn("backgroundEffect", "background"),
    { kind: "attributes", field: "shadow", at: ["shadow"] },
    {
      kind: "dataDefined",
      field: "dataDefinedProperties",
      tag: "dd_properties",
    },
  ],
};

/** `<settings>` as written by QgsPalLayerSettings. */
export const labelSettingsSpec: Spec = {
  tag: "settings",
  entries: [
    {
      kind: "attribute",
      field: "fieldName",
      attribute: "fieldName",
      type: "string",
      at: ["text-style"],
    },
    {
      kind: "attribute",
      field: "isExpression",
      attribute: "isExpression",
      type: "boolean",
      at: ["text-style"],
    },
    {
      kind: "object",
      field: "format",
      at: ["text-style"],
      spec: textFormatSpec,
    },
    {
      kind: "records",
      field: "substitutions",
      at: ["text-style", "substitutions"],
      item: "replacement",
    },
    { kind: "attributes", field: "formatting", at: ["text-format"] },
    { kind: "attributes", field: "placement", at: ["placement"] },
    { kind: "attributes", field: "rendering", at: ["rendering"] },
    {
      kind: "dataDefined",
      field: "dataDefinedProperties",
      tag: "dd_properties",
    },
    {
      kind: "attribute",
      field: ["callout", "type"],
      attribute: "calloutType",
      type: "string",
    },
    {
      kind: "object",
      field: "callout",
      at: ["callout"],
      spec: {
        tag: "callout",
        entries: [
          rule("type", "type", "string"),
          { kind: "variant", field: "properties", at: ["Option"] },
        ],
      },
    },
  ],
};

const ruleEntries: Entry[] = [
  rule("filter", "filter", "string"),
  rule("description", "description", "string"),
  rule("minScaleDenominator", "scalemindenom", "number"),
  rule("maxScaleDenominator", "scalemaxdenom", "number"),
  rule("active", "active", "boolean"),
  rule("key", "key", "string"),
  {
    kind: "object",
    field: "settings",
    at: ["settings"],
    spec: labelSettingsSpec,
  },
];
const ruleSpec: Spec = {
  tag: "rule",
  aliases: ["rules"],
  entries: ruleEntries,
};
const rootRuleSpec: Spec = {
  tag: "rules",
  aliases: ["rule"],
  entries: ruleEntries,
};
ruleEntries.push({ kind: "owners", field: "children", spec: ruleSpec });

const type = rule("type", "type", "string");

/** `<labeling>` of a vector layer. */
export const labeling = union("labeling", {
  simple: {
    tag: "labeling",
    entries: [
      type,
      {
        kind: "object",
        field: "settings",
        at: ["settings"],
        spec: labelSettingsSpec,
      },
    ],
  },
  "rule-based": {
    tag: "labeling",
    entries: [type, { kind: "owner", field: "rootRule", spec: rootRuleSpec }],
  },
});
