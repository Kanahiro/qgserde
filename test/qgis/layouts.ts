import { readFileSync } from "node:fs";
import type { QgsLayoutItem, QgsProject } from "../../src/index.ts";
import { parseQgs } from "../../src/index.ts";

const byId = (items: QgsLayoutItem[] | undefined, id: string) => {
  const item = items?.find((candidate) => candidate.attributes?.id === id);
  if (!item) throw new Error(`Missing layout item ${id}`);
  return item;
};

/** The QGIS-written layout fixture, edited, plus a layout built from scratch. */
export function createLayoutsProject(): QgsProject {
  const project = parseQgs(
    readFileSync(
      new URL("../fixtures/qgis3-layouts.qgs", import.meta.url),
      "utf8",
    ),
  );
  const layout = project.layouts?.[0];
  if (!layout) throw new Error("Missing layout");
  layout.name = "Edited layout";
  byId(layout.items, "title").attributes!.labelText = "Edited title";
  const map = byId(layout.items, "main map");
  map.extent = { xmin: 135, ymin: 35, xmax: 145, ymax: 42 };
  map.grids![0]!.attributes!.intervalX = 2;
  const shape = layout.items?.find((item) => item.type === "65643");
  shape!.symbol!.layers[0]!.properties.color = "0,128,0,255";
  layout.atlas!.filenamePattern = "'atlas_' || @atlas_featurenumber";
  layout.multiFrames![0]!.columns![0]!.attributes!.heading = "Name!";
  layout.customProperties = { "plugin/x": "2" };

  const points = project.layers[0]!;
  project.layouts!.push({
    name: "New layout",
    attributes: { units: "mm", printResolution: 300 },
    pages: [
      {
        type: "65638",
        attributes: {
          uuid: "{aaaaaaaa-0000-0000-0000-000000000001}",
          position: "0,0,mm",
          size: "297,210,mm",
        },
      },
    ],
    items: [
      {
        type: "65641",
        attributes: {
          id: "heading",
          uuid: "{aaaaaaaa-0000-0000-0000-000000000002}",
          labelText: "Hello layout",
          position: "10,10,mm",
          size: "100,20,mm",
          positionOnPage: "10,10,mm",
          visibility: "1",
        },
        format: { style: { fontSize: 24 } },
      },
      {
        type: "65639",
        attributes: {
          id: "overview map",
          uuid: "{aaaaaaaa-0000-0000-0000-000000000003}",
          position: "10,40,mm",
          size: "150,100,mm",
          positionOnPage: "10,40,mm",
          keepLayerSet: "true",
          visibility: "1",
        },
        extent: { xmin: 130, ymin: 30, xmax: 150, ymax: 45 },
        crs: { authId: "EPSG:4326" },
        layers: [
          {
            id: points.id,
            name: points.name,
            source: points.source,
            provider: points.provider,
          },
        ],
        layerStyleOverrides: [
          {
            layerid: points.id,
            name: points.name,
            source: points.source,
            provider: points.provider,
          },
        ],
        labelBlockingItems: ["{aaaaaaaa-0000-0000-0000-000000000002}"],
      },
      {
        type: "65642",
        attributes: {
          id: "legend",
          uuid: "{aaaaaaaa-0000-0000-0000-000000000004}",
          position: "170,40,mm",
          size: "50,50,mm",
          positionOnPage: "170,40,mm",
          legendFilterByMap: "1",
          visibility: "1",
        },
        filterByMaps: ["{aaaaaaaa-0000-0000-0000-000000000003}"],
      },
      {
        type: "65646",
        attributes: {
          id: "scale",
          uuid: "{aaaaaaaa-0000-0000-0000-000000000005}",
          position: "10,150,mm",
          size: "60,10,mm",
          positionOnPage: "10,150,mm",
          mapUuid: "{aaaaaaaa-0000-0000-0000-000000000003}",
          visibility: "1",
        },
        numericFormat: {
          id: "basic",
          settings: { decimals: 3, show_thousand_separator: false },
        },
      },
      {
        type: "65637",
        attributes: {
          id: "group",
          uuid: "{aaaaaaaa-0000-0000-0000-000000000006}",
          position: "10,10,mm",
          size: "150,130,mm",
          positionOnPage: "10,10,mm",
          visibility: "1",
        },
        groupItems: [
          "{aaaaaaaa-0000-0000-0000-000000000002}",
          "{aaaaaaaa-0000-0000-0000-000000000003}",
        ],
      },
      {
        type: "65647",
        attributes: {
          id: "",
          uuid: "{aaaaaaaa-0000-0000-0000-000000000007}",
          position: "170,100,mm",
          size: "60,30,mm",
          positionOnPage: "170,100,mm",
          multiFrame: "{aaaaaaaa-0000-0000-0000-000000000008}",
          visibility: "1",
        },
      },
      {
        type: "65654",
        attributes: {
          id: "profile",
          uuid: "{aaaaaaaa-0000-0000-0000-000000000009}",
          position: "170,140,mm",
          size: "100,50,mm",
          positionOnPage: "170,140,mm",
          tolerance: 5,
          visibility: "1",
        },
        crs: { authId: "EPSG:4326" },
        curve: "LineString (139 35, 141 37)",
        profileLayers: [{ id: points.id }],
        plot: {
          attributes: { minX: 0, maxX: 100, minY: -5, maxY: 50 },
          xAxis: { attributes: { gridIntervalMajor: 20, suffix: " m" } },
          yAxis: { attributes: { gridIntervalMajor: 10 } },
        },
      },
    ],
    multiFrames: [
      {
        type: "65652",
        attributes: {
          uuid: "{aaaaaaaa-0000-0000-0000-000000000008}",
          includeHeader: true,
        },
        frames: [{ uuid: "{aaaaaaaa-0000-0000-0000-000000000007}" }],
        columns: [
          { attributes: { heading: "A" } },
          { attributes: { heading: "B" } },
        ],
        headers: [
          { attributes: { heading: "A" } },
          { attributes: { heading: "B" } },
        ],
        rows: [{ cells: [{ content: "1" }, { content: "two" }] }],
        rowHeights: [{ height: 0 }],
        columnWidths: [{ width: 20 }, { width: 0 }],
      },
    ],
  });
  return project;
}
