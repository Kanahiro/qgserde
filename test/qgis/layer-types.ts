import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { QgsProject } from "../../src/index.ts";
import { createProject, parseQgs } from "../../src/index.ts";

/** Write the one-quad 2DM mesh the layer-types project reads. */
export function writeMeshData(directory: string): void {
  writeFileSync(
    join(directory, "mesh.2dm"),
    "MESH2D\nND 1 140 40 1\nND 2 141 40 2\nND 3 141 41 3\nND 4 140 41 4\nE4Q 1 1 2 3 4 1\n",
  );
}

const marker = (color: string) => ({
  type: "marker" as const,
  layers: [{ class: "SimpleMarker", properties: { color } }],
});

/** Vector tile, mesh, annotation, and group layers with modeled settings. */
export function createLayerTypesProject(): QgsProject {
  const project = createProject({ title: "Layer types" });
  const crs = { authId: "EPSG:4326" };
  project.crs = crs;
  project.layers.push(
    {
      type: "vector-tile",
      id: "tiles_layer_00001",
      name: "tiles",
      provider: "xyzvectortiles",
      source: "type=xyz&url=https://example.com/{z}/{x}/{y}.pbf&zmin=0&zmax=14",
      crs: { authId: "EPSG:3857" },
      renderer: {
        type: "basic",
        styles: [
          {
            attributes: {
              name: "roads",
              layer: "roads",
              geometry: 1,
              enabled: true,
              "min-zoom": 5,
              "max-zoom": -1,
              expression: "\"class\" = 'major'",
            },
            symbol: {
              type: "line",
              layers: [
                {
                  class: "SimpleLine",
                  properties: { line_color: "255,0,0,255" },
                },
              ],
            },
          },
        ],
      },
      labeling: {
        type: "basic",
        styles: [
          {
            attributes: {
              name: "names",
              layer: "places",
              geometry: 0,
              enabled: true,
            },
            settings: {
              fieldName: "name",
              format: { style: { fontSize: 9 } },
            },
          },
        ],
      },
    },
    {
      type: "mesh",
      id: "mesh_layer_000001",
      name: "mesh",
      provider: "mdal",
      source: "./mesh.2dm",
      crs,
      renderer: {
        activeDatasetGroup: { scalar: 0, vector: -1 },
        nativeMesh: {
          enabled: true,
          color: "255,0,0,255",
          "line-width": 0.5,
          "line-width-unit": "MM",
        },
        scalarSettings: [
          {
            attributes: {
              group: 0,
              "min-val": 1,
              "max-val": 4,
              opacity: 0.8,
              "interpolation-method": "none",
            },
            shader: {
              attributes: {
                colorRampType: "DISCRETE",
                minimumValue: 1,
                maximumValue: 4,
              },
              items: [
                { value: 2, color: "#0000ff", alpha: 255, label: "low" },
                { value: 4, color: "#ff0000", alpha: 255, label: "high" },
              ],
            },
          },
        ],
      },
    },
    {
      type: "annotation",
      id: "notes_layer_00001",
      name: "notes",
      provider: "",
      source: "",
      crs,
      items: [
        {
          attributes: {
            type: "marker",
            id: "{11111111-1111-1111-1111-111111111111}",
            x: 140.5,
            y: 40.5,
            zIndex: 1,
          },
          markerSymbol: marker("0,0,255,255"),
        },
        {
          attributes: {
            type: "pointtext",
            id: "{22222222-2222-2222-2222-222222222222}",
            text: "Hello",
            x: 140,
            y: 40,
          },
          format: { style: { fontSize: 14, textColor: "255,0,0,255" } },
        },
      ],
    },
    {
      type: "vector",
      id: "inner_layer_00001",
      name: "inner",
      provider: "memory",
      source: "Point?crs=EPSG:4326",
      crs,
      fields: [],
    },
    {
      type: "group",
      id: "group_layer_00001",
      name: "group",
      provider: "",
      source: "",
      crs,
      childLayers: ["inner_layer_00001"],
    },
  );
  return project;
}

/** The QGIS-written layer-types fixture with edited mesh, annotation, and tile settings. */
export function editLayerTypesFixture(): QgsProject {
  const project = parseQgs(
    readFileSync(
      new URL("../fixtures/qgis3-layer-types.qgs", import.meta.url),
      "utf8",
    ),
  );
  project.title = "Layer types (edited)";
  for (const layer of project.layers) {
    if (layer.type === "mesh") {
      const scalar = layer.renderer?.scalarSettings?.[0];
      if (!scalar?.attributes || !scalar.shader) throw new Error("mesh");
      scalar.attributes.opacity = 0.8;
      scalar.shader.items = [
        { value: 2, color: "#0000ff", alpha: 255, label: "low" },
        { value: 4, color: "#ff0000", alpha: 255, label: "high" },
      ];
      layer.renderer!.vectorSettings = [
        {
          attributes: { group: 0, symbology: 0, "line-width": 0.4 },
          arrow: {
            "arrow-head-width-ratio": 0.3,
            "arrow-head-length-ratio": 0.4,
          },
          shaftLength: { method: "fixed", "fixed-length": 12 },
          windBarb: { "shaft-length": 5 },
        },
      ];
    }
    if (layer.type === "annotation" && layer.items) {
      layer.items = layer.items.filter(
        (item) => item.attributes?.type !== "linestring",
      );
      for (const item of layer.items) {
        if (item.markerSymbol)
          item.markerSymbol.layers[0]!.properties.color = "0,0,255,255";
        if (item.format?.style) item.format.style.fontSize = 14;
      }
    }
  }
  return project;
}
