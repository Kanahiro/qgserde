import { putElementText, remove, replaceChildren } from "./codec.ts";
import { QgsError } from "./errors.ts";
import { labeling } from "./labeling.ts";
import type { Custom, Entry, Spec } from "./spec.ts";
import type { QgsVariant, QgsVariantMap, XmlElement } from "./types.ts";
import { bindVariant, isMap, readVariant, writeVariant } from "./variant.ts";
import { createElement, findChild, findChildren, getText } from "./xml.ts";

const text = (
  field: string,
  tag: string,
  type: "string" | "number" = "string",
): Entry => ({ kind: "text", field, at: [tag], type });
const attributes = (field: string, ...at: string[]): Entry => ({
  kind: "attributes",
  field,
  at,
});

/** `<customproperties>`: an <Option> map since QGIS 3.20, `<property>` elements before. */
export const customProperties: Custom = {
  read(element) {
    const container = findChild(element, "customproperties");
    if (!container) return undefined;
    const option = findChild(container, "Option");
    if (option?.attributes.type === "Map") {
      const value = readVariant(option);
      return isMap(value) && Object.keys(value).length ? value : undefined;
    }
    const properties = findChildren(container, "property");
    if (!properties.length) return undefined;
    return Object.fromEntries(
      properties.map((property) => {
        const values = findChildren(property, "value");
        return [
          property.attributes.key ?? "",
          property.attributes.value ?? values.map(getText),
        ];
      }),
    );
  },
  capture(_value, element, codec, path) {
    const container = findChild(element, "customproperties");
    const option = container && findChild(container, "Option");
    if (option?.attributes.type === "Map")
      bindVariant(
        (target, name, at, format) =>
          codec.bindAttribute(target, name, at, format),
        option,
        path,
      );
    else if (container)
      for (const property of findChildren(container, "property"))
        codec.bindAttribute(property, "value", [
          ...path,
          property.attributes.key ?? "",
        ]);
  },
  restore() {},
  write(value, element, _codec, target) {
    const map = (value ?? {}) as QgsVariantMap;
    if (!isMap(map))
      throw new QgsError(
        "INVALID_EDIT",
        "customProperties must be a plain object",
      );
    let container = findChild(element, "customproperties");
    if (!container) {
      if (!Object.keys(map).length) return;
      container = createElement("customproperties");
      element.children.push(container);
    }
    if (target.major === 3 && target.minor < 20) {
      remove(container, "Option");
      const existing = findChildren(container, "property");
      replaceChildren(
        container,
        ["property"],
        Object.entries(map).map(([key, item]) =>
          legacyProperty(
            key,
            item,
            existing.find((property) => property.attributes.key === key),
          ),
        ),
      );
      return;
    }
    remove(container, "property");
    let option = findChild(container, "Option");
    if (!option) {
      option = createElement("Option");
      container.children.push(option);
    }
    writeVariant(option, map);
  },
};

function legacyProperty(
  key: string,
  value: QgsVariant,
  source: XmlElement | undefined,
): XmlElement {
  const property = structuredClone(source ?? createElement("property"));
  property.attributes.key = key;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    delete property.attributes.value;
    const items = findChildren(property, "value");
    replaceChildren(
      property,
      ["value"],
      value.map((item, index) => {
        const element = structuredClone(items[index] ?? createElement("value"));
        putElementText(element, item);
        return element;
      }),
    );
    return property;
  }
  if (value !== null && typeof value === "object")
    throw new QgsError(
      "INVALID_EDIT",
      `Custom property ${key} cannot be written for QGIS versions before 3.20`,
    );
  remove(property, "value");
  property.attributes.value = value === null ? "" : String(value);
  return property;
}

const symbolIn = (field: string, wrapper: string): Entry => ({
  kind: "symbol",
  field,
  name: "",
  at: [wrapper],
});

const metadataBase: Entry[] = [
  {
    kind: "owners",
    field: "keywords",
    spec: {
      tag: "keywords",
      entries: [
        {
          kind: "attribute",
          field: "vocabulary",
          attribute: "vocabulary",
          type: "string",
        },
        { kind: "values", field: "keywords", at: [], item: "keyword" },
      ],
    },
  },
  {
    kind: "owners",
    field: "contacts",
    spec: {
      tag: "contact",
      entries: [
        { kind: "texts", field: "fields", at: [] },
        {
          kind: "records",
          field: "addresses",
          at: [],
          item: "contactAddress",
          texts: true,
        },
      ],
    },
  },
  { kind: "records", field: "links", at: ["links"], item: "link" },
  { kind: "values", field: "history", at: [], item: "history" },
  { kind: "records", field: "dates", at: ["dates"], item: "date" },
];

/** QgsLayerMetadata (`<resourceMetadata>`). */
export const layerMetadataSpec: Spec = {
  tag: "resourceMetadata",
  entries: [
    text("identifier", "identifier"),
    text("parentIdentifier", "parentidentifier"),
    text("language", "language"),
    text("type", "type"),
    text("title", "title"),
    text("abstract", "abstract"),
    ...metadataBase,
    text("fees", "fees"),
    { kind: "values", field: "rights", at: [], item: "rights" },
    { kind: "values", field: "licenses", at: [], item: "license" },
    {
      kind: "records",
      field: "constraints",
      at: [],
      item: "constraints",
      text: "value",
    },
    text("encoding", "encoding"),
    { kind: "crs", field: "crs", tag: "crs" },
    {
      kind: "records",
      field: "spatialExtents",
      at: ["extent"],
      item: "spatial",
    },
  ],
};

/** Metadata entries shared with project metadata. */
export { metadataBase };

/** Settings common to every layer type. */
export const commonLayerEntries: Entry[] = [
  {
    kind: "attributes",
    field: "attributes",
    exclude: [
      "type",
      "id",
      "minScale",
      "maxScale",
      "hasScaleBasedVisibilityFlag",
      "geometry",
      "wkbType",
      "readOnly",
      "labelsEnabled",
    ],
  },
  { kind: "texts", field: "flags", at: ["flags"] },
  { kind: "custom", field: "customProperties", custom: customProperties },
  text("blendMode", "blendMode", "number"),
  text("mapTip", "mapTip"),
  {
    kind: "attribute",
    field: "mapTipEnabled",
    attribute: "enabled",
    type: "boolean",
    at: ["mapTip"],
  },
  attributes("legend", "legend"),
  {
    kind: "object",
    field: "temporal",
    at: ["temporal"],
    spec: {
      tag: "temporal",
      entries: [
        { kind: "attributes", field: "attributes" },
        { kind: "texts", field: "fixedRange", at: ["fixedRange"] },
      ],
    },
  },
  {
    kind: "object",
    field: "elevation",
    at: ["elevation"],
    spec: {
      tag: "elevation",
      entries: [
        { kind: "attributes", field: "attributes" },
        {
          kind: "dataDefined",
          field: "dataDefinedProperties",
          tag: "data-defined-properties",
        },
        symbolIn("profileLineSymbol", "profileLineSymbol"),
        symbolIn("profileFillSymbol", "profileFillSymbol"),
        symbolIn("profileMarkerSymbol", "profileMarkerSymbol"),
      ],
    },
  },
  {
    kind: "object",
    field: "metadata",
    at: ["resourceMetadata"],
    spec: layerMetadataSpec,
  },
  {
    kind: "object",
    field: "server",
    at: [],
    spec: {
      tag: "maplayer",
      entries: [
        text("shortName", "shortname"),
        text("title", "title"),
        text("abstract", "abstract"),
        {
          kind: "values",
          field: "keywords",
          at: ["keywordList"],
          item: "value",
        },
        text("dataUrl", "dataUrl"),
        {
          kind: "attribute",
          field: "dataUrlFormat",
          attribute: "format",
          type: "string",
          at: ["dataUrl"],
        },
        text("attribution", "attribution"),
        {
          kind: "attribute",
          field: "attributionUrl",
          attribute: "href",
          type: "string",
          at: ["attribution"],
        },
        text("legendUrl", "legendUrl"),
        {
          kind: "attribute",
          field: "legendUrlFormat",
          attribute: "format",
          type: "string",
          at: ["legendUrl"],
        },
        {
          kind: "records",
          field: "metadataUrls",
          at: ["metadataUrls"],
          item: "metadataUrl",
          text: "url",
        },
      ],
    },
  },
];

const labelStyle: Entry = {
  kind: "object",
  field: "labelStyle",
  at: ["labelStyle"],
  spec: {
    tag: "labelStyle",
    entries: [
      { kind: "attributes", field: "attributes" },
      attributes("font", "labelFont"),
    ],
  },
};

const formItem = (tag: string): Spec => ({
  tag,
  entries: [{ kind: "attributes", field: "attributes" }, labelStyle],
});
const container = formItem("attributeEditorContainer");
const formNodes: Record<string, Spec> = {
  container,
  field: formItem("attributeEditorField"),
  relation: formItem("attributeEditorRelation"),
  action: formItem("attributeEditorAction"),
  qml: formItem("attributeEditorQmlElement"),
  html: formItem("attributeEditorHtmlElement"),
  text: formItem("attributeEditorTextElement"),
  spacer: formItem("attributeEditorSpacerElement"),
};
(container.entries as Entry[]).push({
  kind: "nodes",
  field: "children",
  specs: formNodes,
});

const conditionalStyle: Spec = {
  tag: "style",
  entries: [
    { kind: "attributes", field: "attributes" },
    attributes("font", "font"),
    { kind: "symbol", field: "symbol", name: "icon" },
  ],
};

const relation: Spec = {
  tag: "relation",
  entries: [
    { kind: "attributes", field: "attributes" },
    { kind: "records", field: "fieldRefs", at: [], item: "fieldRef" },
  ],
};

/** Vector layer settings described declaratively. */
export const vectorLayerEntries: Entry[] = [
  { kind: "custom", field: "labeling", custom: labeling },
  text("featureBlendMode", "featureBlendMode", "number"),
  text("displayExpression", "previewExpression"),
  {
    kind: "records",
    field: "expressionFields",
    at: ["expressionfields"],
    item: "field",
    mirror: true,
  },
  {
    kind: "owners",
    field: "joins",
    at: ["vectorjoins"],
    spec: {
      tag: "join",
      entries: [
        { kind: "attributes", field: "attributes" },
        {
          kind: "values",
          field: "fields",
          at: ["joinFieldsSubset"],
          item: "field",
          attribute: "name",
        },
      ],
    },
  },
  {
    kind: "values",
    field: "dataDependencies",
    at: ["dataDependencies"],
    item: "layer",
    attribute: "id",
  },
  {
    kind: "values",
    field: "layerDependencies",
    at: ["layerDependencies"],
    item: "layer",
    attribute: "id",
  },
  {
    kind: "owners",
    field: "actions",
    at: ["attributeactions"],
    spec: {
      tag: "actionsetting",
      entries: [
        { kind: "attributes", field: "attributes" },
        {
          kind: "values",
          field: "scopes",
          at: [],
          item: "actionScope",
          attribute: "id",
        },
      ],
    },
  },
  {
    kind: "records",
    field: "defaultActions",
    at: ["attributeactions"],
    item: "defaultAction",
  },
  {
    kind: "object",
    field: "attributeTable",
    at: ["attributetableconfig"],
    spec: {
      tag: "attributetableconfig",
      entries: [
        { kind: "attributes", field: "attributes" },
        { kind: "records", field: "columns", at: ["columns"], item: "column" },
      ],
    },
  },
  {
    kind: "object",
    field: "conditionalStyles",
    at: ["conditionalstyles"],
    spec: {
      tag: "conditionalstyles",
      entries: [
        {
          kind: "owners",
          field: "rowStyles",
          at: ["rowstyles"],
          spec: conditionalStyle,
        },
        {
          kind: "owners",
          field: "fieldStyles",
          at: ["fieldstyles"],
          spec: {
            tag: "fieldstyle",
            entries: [
              {
                kind: "attribute",
                field: "field",
                attribute: "fieldname",
                type: "string",
              },
              { kind: "owners", field: "styles", spec: conditionalStyle },
            ],
          },
        },
      ],
    },
  },
  {
    kind: "records",
    field: "storedExpressions",
    at: ["storedexpressions"],
    item: "storedexpression",
  },
  {
    kind: "object",
    field: "form",
    at: [],
    spec: {
      tag: "maplayer",
      entries: [
        text("layout", "editorlayout"),
        text("uiFile", "editform"),
        text("initFunction", "editforminit"),
        text("initCodeSource", "editforminitcodesource", "number"),
        text("initFilePath", "editforminitfilepath"),
        text("initCode", "editforminitcode"),
        text("suppress", "featformsuppress", "number"),
        {
          kind: "object",
          field: "labelStyle",
          at: ["attributeEditorForm", "labelStyle"],
          spec: (labelStyle as Extract<Entry, { kind: "object" }>).spec,
        },
        {
          kind: "nodes",
          field: "items",
          at: ["attributeEditorForm"],
          specs: formNodes,
        },
      ],
    },
  },
  {
    kind: "owners",
    field: "widgets",
    at: ["widgets"],
    spec: {
      tag: "widget",
      entries: [
        { kind: "attribute", field: "name", attribute: "name", type: "string" },
        { kind: "variant", field: "config", at: ["config"] },
      ],
    },
  },
  {
    kind: "object",
    field: "geometryOptions",
    at: ["geometryOptions"],
    spec: {
      tag: "geometryOptions",
      entries: [
        { kind: "attributes", field: "attributes" },
        { kind: "variant", field: "activeChecks", at: ["activeChecks"] },
        {
          kind: "variant",
          field: "checkConfiguration",
          at: ["checkConfiguration"],
        },
      ],
    },
  },
  attributes("selection", "selection"),
  attributes("auxiliaryLayer", "auxiliaryLayer"),
  {
    kind: "owners",
    field: "referencedLayers",
    at: ["referencedLayers"],
    spec: relation,
  },
  {
    kind: "owners",
    field: "referencingLayers",
    at: ["referencingLayers"],
    spec: relation,
  },
];

export { relation as relationSpec };
