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
      },
    ],
  });
  return project;
}
