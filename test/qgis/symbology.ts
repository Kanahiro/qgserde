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
      id: "nothing_layer_001",
      name: "nothing",
      source: "Point?crs=EPSG:4326",
      renderer: { type: "nullSymbol" },
    },
  );
  return project;
}
