import type { QgsProject } from "../../src/index.ts";
import { createProject } from "../../src/index.ts";

/** Vector field, form, table, join, and common layer settings on memory layers. */
export function createSettingsProject(): QgsProject {
  const project = createProject({ title: "Settings" });
  project.crs = { authId: "EPSG:4326" };
  const crs = { authId: "EPSG:4326" };
  project.layers.push(
    {
      type: "vector",
      id: "countries_layer_01",
      name: "countries",
      provider: "memory",
      source: "Polygon?crs=EPSG:4326&field=id:integer&field=cname:string",
      crs,
      fields: [],
    },
    {
      type: "vector",
      id: "cities_layer_00001",
      name: "cities",
      provider: "memory",
      source:
        "Point?crs=EPSG:4326&field=id:integer&field=name:string&field=country_id:integer&field=pop:double",
      crs,
      fields: [
        { name: "id", editable: false, constraints: 2, uniqueStrength: 2 },
        {
          name: "name",
          alias: "City name",
          labelOnTop: true,
          reuseLastValue: true,
          constraints: 1,
          notNullStrength: 1,
        },
        {
          name: "pop",
          editorWidgetType: "Range",
          editorWidgetConfig: { Min: 0, Max: 1000, Step: 5, Style: "SpinBox" },
          defaultExpression: "0",
          applyDefaultOnUpdate: true,
          constraints: 4,
          expressionStrength: 2,
          constraintExpression: '"pop" >= 0',
          constraintDescription: "positive",
          splitPolicy: "GeometryRatio",
        },
      ],
      displayExpression: '"name"',
      mapTip: "<b>[% name %]</b>",
      expressionFields: [
        {
          name: "pop_k",
          expression: '"pop" / 1000',
          type: "6",
          typeName: "double",
          length: "0",
          precision: "0",
          comment: "",
          subType: "0",
        },
      ],
      joins: [
        {
          attributes: {
            joinLayerId: "countries_layer_01",
            joinFieldName: "id",
            targetFieldName: "country_id",
            memoryCache: "1",
            hasCustomPrefix: "1",
            customPrefix: "c_",
          },
          fields: ["cname"],
        },
      ],
      dataDependencies: ["countries_layer_01"],
      actions: [
        {
          attributes: {
            name: "Say hi",
            type: "1",
            action: "print('[% name %]')",
            capture: "0",
            id: "{11111111-1111-1111-1111-111111111111}",
          },
          scopes: ["Feature", "Canvas"],
        },
      ],
      attributeTable: {
        attributes: { sortExpression: '"pop"', sortOrder: "1" },
        columns: [
          { type: "field", name: "name", width: "120", hidden: "0" },
          { type: "field", name: "pop", width: "-1", hidden: "1" },
        ],
      },
      conditionalStyles: {
        rowStyles: [
          {
            attributes: {
              rule: '"pop" > 100',
              name: "big",
              text_color: "#0000ff",
            },
          },
        ],
        fieldStyles: [
          {
            field: "pop",
            styles: [
              {
                attributes: {
                  rule: "@value > 10",
                  background_color: "#ff0000",
                },
              },
            ],
          },
        ],
      },
      form: {
        layout: "tablayout",
        initFunction: "my_init",
        initCodeSource: 2,
        initCode: "def my_init(dialog, layer, feature):\n    pass\n",
        items: [
          {
            kind: "container",
            attributes: { name: "Main", type: "Tab", columnCount: "2" },
            children: [
              { kind: "field", attributes: { name: "name", index: "1" } },
              {
                kind: "container",
                attributes: { name: "Numbers", type: "GroupBox" },
                children: [
                  { kind: "field", attributes: { name: "pop", index: "3" } },
                ],
              },
            ],
          },
        ],
      },
      customProperties: { "plugin/key": "value", "plugin/count": 3 },
      flags: {
        Identifiable: "1",
        Removable: "0",
        Searchable: "0",
        Private: "0",
      },
      blendMode: 6,
      featureBlendMode: 7,
      server: {
        shortName: "cities",
        title: "Cities",
        abstract: "Some cities",
        keywords: ["one", "two"],
        dataUrl: "https://example.com/data",
        dataUrlFormat: "text/html",
        attribution: "Example",
        attributionUrl: "https://example.com",
      },
      metadata: {
        title: "Cities metadata",
        abstract: "About cities",
        keywords: [{ vocabulary: "gmd:topicCategory", keywords: ["location"] }],
        contacts: [{ fields: { name: "Alice", email: "a@example.com" } }],
        links: [{ name: "home", type: "WWW:LINK", url: "https://example.com" }],
        licenses: ["CC-BY"],
        rights: ["open"],
        history: ["created"],
      },
      temporal: {
        attributes: {
          enabled: "1",
          mode: "1",
          startField: "pop",
          durationUnit: "min",
        },
      },
      diagram: {
        renderer: "SingleCategoryDiagramRenderer",
        attributes: { diagramType: "Pie", attributeLegend: "1" },
        categories: [
          {
            attributes: {
              enabled: "1",
              width: "12",
              height: "12",
              sizeType: "MM",
              opacity: "1",
            },
            fields: [
              { field: '"pop"', color: "#ff0000", label: "Population" },
              { field: '"id"', color: "#0000ff", label: "ID" },
            ],
          },
        ],
      },
      diagramSettings: {
        attributes: { placement: "0", dist: "2", priority: "5", showAll: "1" },
      },
      selectionColor: {
        spec: "rgb",
        red: "1",
        green: "0",
        blue: "1",
        alpha: "1",
      },
      geometryOptions: {
        attributes: { geometryPrecision: "0.01", removeDuplicateNodes: "1" },
      },
    },
  );
  return project;
}
