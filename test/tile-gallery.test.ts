import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  parseQgs,
  type QgsLayerTreeGroup,
  serializeQgs,
} from "../src/index.ts";
import {
  createTileGallery,
  createTileTree,
  tileSources,
} from "./qgis/tile-gallery.ts";

const templateXml = readFileSync(
  new URL("./fixtures/template.qgs", import.meta.url),
  "utf8",
);

test("tile fixture contains the expected raster/vector layers and has a single visible OSM reference", () => {
  const project = parseQgs(
    serializeQgs(createTileGallery(templateXml), { version: "4.2" }),
  );
  assert.equal(project.layers.length, tileSources.length);
  assert.ok(project.layers.every((layer) => layer.id.length > 10));
  assert.equal(
    new Set(project.layers.map((layer) => layer.id)).size,
    tileSources.length,
  );
  assert.ok(
    project.layers.every(
      (layer) => layer.type === "raster" || layer.type === "vector-tile",
    ),
  );
  assert.equal(
    project.layers.filter((layer) => layer.type === "vector-tile").length,
    5,
  );
  const visible: string[] = [];
  const references: string[] = [];
  const ids = new Set(project.layers.map((layer) => layer.id));
  let maximumDepth = 0;
  let groups = 0;
  function visit(
    group: QgsLayerTreeGroup,
    parentVisible: boolean,
    depth: number,
  ): void {
    groups++;
    maximumDepth = Math.max(maximumDepth, depth);
    const isVisible = parentVisible && group.checked !== "unchecked";
    for (const child of group.children) {
      if (child.type === "group") visit(child, isVisible, depth + 1);
      else {
        assert.ok(ids.has(child.layerId), `Missing ${child.layerId}`);
        references.push(child.layerId);
        if (isVisible && child.checked !== "unchecked")
          visible.push(child.layerId);
      }
    }
  }
  assert.ok(project.layerTree);
  visit(project.layerTree, true, 1);
  assert.deepEqual(visible, ["osm_standard"]);
  assert.ok(maximumDepth >= 5);
  assert.ok(groups >= 20);
  assert.ok(references.length > project.layers.length);
  for (const id of ids) assert.ok(references.includes(id));
  assert.equal(project.crs?.authId, "EPSG:3857");
  assert.ok(project.extent);
  const roundTrip = parseQgs(serializeQgs(project, { version: "4.2" }));
  assert.deepEqual(roundTrip, project);
});

test("tile gallery tree is recreated without sharing mutable tree nodes", () => {
  const original = createTileTree();
  const updated = createTileTree();
  updated.children.length = 0;
  assert.ok(original.children.length >= 5);
});
