import type { QgsProject, QgsSymbol } from "../../src/index.ts";
import { createProject } from "../../src/index.ts";

const fill = (color: string): QgsSymbol => ({
  type: "fill",
  layers: [
    {
      class: "SimpleFill",
      properties: { color, outline_color: "0,0,0,255", outline_width: "0.4" },
    },
  ],
});

/** Memory layers with every modeled renderer type, readable without data files. */
export function createSymbologyProject(): QgsProject {
  const project = createProject({ title: "Symbology" });
  project.crs = { authId: "EPSG:4326" };
  const base = { provider: "memory", crs: { authId: "EPSG:4326" }, fields: [] };
  project.layers.push(
    {
      ...base,
      type: "vector",
      id: "categories_layer_001",
      name: "categories",
      source: "Polygon?crs=EPSG:4326&field=kind:string",
      labelsEnabled: true,
      labeling: {
        type: "simple",
        settings: {
          fieldName: "upper(kind)",
          isExpression: true,
          format: {
            style: { fontSize: "11", textColor: "200,0,0,255" },
            buffer: { bufferDraw: "1", bufferSize: "2" },
            background: {
              attributes: { shapeDraw: "1", shapeType: "5" },
              markerSymbol: {
                type: "marker",
                layers: [
                  { class: "SimpleMarker", properties: { name: "star" } },
                ],
              },
            },
          },
          placement: { placement: "1", dist: "3" },
          dataDefinedProperties: {
            Size: { active: true, type: 3, expression: "12" },
          },
          callout: { type: "simple", properties: { enabled: "1" } },
        },
      },
      renderer: {
        type: "categorizedSymbol",
        attribute: "kind",
        categories: [
          {
            value: "park",
            label: "Park",
            render: true,
            symbol: fill("0,160,0,255"),
          },
          {
            value: 7,
            label: "Seven",
            render: false,
            symbol: {
              ...fill("255,0,0,255"),
              opacity: 0.5,
              dataDefinedProperties: {
                alpha: { active: false, type: 3, expression: "50" },
              },
            },
          },
        ],
        sourceSymbol: fill("200,200,200,255"),
        colorRamp: {
          type: "gradient",
          properties: { color1: "255,255,255,255", color2: "0,0,255,255" },
        },
      },
    },
    {
      ...base,
      type: "vector",
      id: "graduated_layer_001",
      name: "graduated",
      source: "Point?crs=EPSG:4326&field=value:double",
      renderer: {
        type: "graduatedSymbol",
        attribute: "value",
        graduatedMethod: "GraduatedColor",
        ranges: [0, 10].map((lower) => ({
          lower,
          upper: lower + 10,
          label: `${lower} - ${lower + 10}`,
          render: true,
          symbol: {
            type: "marker" as const,
            layers: [
              {
                class: "SimpleMarker",
                properties: { name: "square", size: String(2 + lower / 5) },
                dataDefinedProperties: {
                  size: { active: true, type: 2, field: "value" },
                },
              },
            ],
          },
        })),
      },
    },
    {
      ...base,
      type: "vector",
      id: "rules_layer_00001",
      name: "rules",
      source: "LineString?crs=EPSG:4326&field=class:string",
      labeling: {
        type: "rule-based",
        rootRule: {
          children: [
            {
              filter: "\"class\" = 'major'",
              maxScaleDenominator: 25000,
              settings: { fieldName: "class", format: { style: {} } },
              children: [],
            },
            { filter: "ELSE", active: false, children: [] },
          ],
        },
      },
      renderer: {
        type: "RuleRenderer",
        rootRule: {
          children: [
            {
              filter: "\"class\" = 'major'",
              label: "Major",
              key: "{major}",
              maxScaleDenominator: 100000,
              symbol: {
                type: "line",
                layers: [
                  {
                    class: "SimpleLine",
                    properties: {
                      line_color: "0,0,255,255",
                      line_width: "1.2",
                    },
                  },
                  {
                    class: "MarkerLine",
                    properties: { interval: "5", placements: "Interval" },
                    subSymbol: {
                      type: "marker",
                      layers: [
                        {
                          class: "SimpleMarker",
                          properties: { name: "triangle", size: "3" },
                        },
                      ],
                    },
                  },
                ],
              },
              children: [
                {
                  filter: "ELSE",
                  label: "Disabled",
                  active: false,
                  children: [],
                  symbol: {
                    type: "line",
                    layers: [{ class: "SimpleLine", properties: {} }],
                  },
                },
              ],
            },
          ],
        },
      },
    },
    {
      ...base,
      type: "vector",
      id: "single_layer_0001",
      name: "single",
      source: "Point?crs=EPSG:4326",
      renderer: {
        type: "singleSymbol",
        symbolLevels: true,
        symbol: {
          type: "marker",
          layers: [
            {
              class: "SimpleMarker",
              enabled: false,
              properties: { color: "1,2,3,255" },
            },
          ],
        },
      },
    },
    {
      ...base,
      type: "vector",
      id: "heatmap_layer_001",
      name: "heatmap",
      source: "Point?crs=EPSG:4326&field=v:double",
      renderer: {
        type: "heatmapRenderer",
        attributes: { radius: "15", weight_expression: '"v"', quality: "3" },
        colorRamp: {
          type: "gradient",
          properties: { color1: "0,0,0,255", color2: "255,0,0,255" },
        },
      },
    },
    {
      ...base,
      type: "vector",
      id: "cluster_layer_001",
      name: "cluster",
      source: "Point?crs=EPSG:4326",
      renderer: {
        type: "pointCluster",
        attributes: { tolerance: "5", toleranceUnit: "MM" },
        renderer: {
          type: "singleSymbol",
          symbol: {
            type: "marker",
            layers: [
              { class: "SimpleMarker", properties: { color: "0,255,0,255" } },
            ],
          },
        },
        clusterSymbol: {
          type: "marker",
          layers: [
            {
              class: "SimpleMarker",
              properties: { color: "0,0,255,255", size: "6" },
            },
          ],
        },
      },
    },
    {
      ...base,
      type: "vector",
      id: "inverted_layer_01",
      name: "inverted",
      source: "Polygon?crs=EPSG:4326",
      renderer: {
        type: "invertedPolygonRenderer",
        attributes: { preprocessing: "1" },
        renderer: { type: "singleSymbol", symbol: fill("0,0,0,128") },
      },
    },
    {
      ...base,
      type: "vector",
      id: "effects_layer_001",
      name: "effects",
      source: "Point?crs=EPSG:4326&field=v:double",
      renderer: {
        type: "singleSymbol",
        orderByEnabled: true,
        orderBy: [{ expression: '"v"', asc: "0", nullsFirst: "1" }],
        effect: {
          type: "effectStack",
          enabled: true,
          effects: [
            {
              type: "dropShadow",
              properties: { blur_level: "3", blur_unit: "MM" },
            },
            { type: "drawSource" },
          ],
        },
        symbol: {
          type: "marker",
          layers: [
            {
              class: "SimpleMarker",
              properties: {},
              effect: {
                type: "effectStack",
                enabled: true,
                effects: [{ type: "outerGlow" }, { type: "drawSource" }],
              },
            },
          ],
        },
      },
    },
    {
      ...base,
      type: "vector",
      id: "nothing_layer_001",
      name: "nothing",
      source: "Point?crs=EPSG:4326",
      renderer: { type: "nullSymbol" },
    },
  );
  return project;
}
