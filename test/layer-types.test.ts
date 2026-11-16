import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { QgsMapLayer, QgsProject } from "../src/index.ts";
import {
  parseJson,
  parseQgs,
  serializeJson,
  serializeQgs,
} from "../src/index.ts";

const fixture = () =>
  parseQgs(
    readFileSync(
      new URL("./fixtures/qgis3-layer-types.qgs", import.meta.url),
      "utf8",
    ),
  );

function layer<T extends QgsMapLayer["type"]>(
  project: QgsProject,
  type: T,
): Extract<QgsMapLayer, { type: T }> {
  const found = project.layers.find((item) => item.type === type);
  if (!found) throw new Error(`Expected a ${type} layer`);
  return found as Extract<QgsMapLayer, { type: T }>;
}

test("reads vector tile, mesh, annotation, and group layers written by QGIS", () => {
  const project = fixture();
  const tiles = layer(project, "vector-tile");
  if (tiles.renderer?.type !== "basic" || tiles.labeling?.type !== "basic")
    throw new Error("basic tiles");
  assert.equal(tiles.renderer.styles[0]?.attributes?.["min-zoom"], "5");
  assert.equal(tiles.renderer.styles[0]?.symbol?.type, "line");
  assert.equal(tiles.labeling.styles[0]?.settings?.fieldName, "name");
  const mesh = layer(project, "mesh");
  assert.equal(mesh.renderer?.nativeMesh?.color, "255,0,0,255");
  assert.equal(
    mesh.renderer?.scalarSettings?.[0]?.shader?.attributes?.colorRampType,
    "INTERPOLATED",
  );
  assert.equal(mesh.renderer?.averaging?.method, "1");
  const notes = layer(project, "annotation");
  assert.deepEqual(
    notes.items?.map((item) => item.attributes?.type),
    ["linestring", "pointtext", "marker"].filter((type) =>
      notes.items?.some((item) => item.attributes?.type === type),
    ),
  );
  const text = notes.items?.find(
    (item) => item.attributes?.type === "pointtext",
  );
  assert.equal(text?.attributes?.text, "Hello");
  assert.ok(text?.format?.style?.fontSize);
  const group = layer(project, "group");
  const inner = project.layers.find((item) => item.name === "inner")!;
  assert.deepEqual(group.childLayers, [inner.id]);
});

test("edits other layer types and keeps the edits through JSON", () => {
  const project = fixture();
  const tiles = layer(project, "vector-tile");
  if (tiles.renderer?.type !== "basic") throw new Error("basic");
  tiles.renderer.styles.push({
    attributes: { name: "water", layer: "water", geometry: "2", enabled: "1" },
    symbol: {
      type: "fill",
      layers: [{ class: "SimpleFill", properties: { color: "0,0,255,255" } }],
    },
  });
  const mesh = layer(project, "mesh");
  mesh.renderer!.nativeMesh!.enabled = "0";
  const notes = layer(project, "annotation");
  const text = notes.items!.find(
    (item) => item.attributes?.type === "pointtext",
  )!;
  text.attributes!.text = "Bye";
  text.format!.style!.fontSize = "20";
  project.mainAnnotationItems = [
    {
      attributes: { type: "marker", x: "1", y: "2", zIndex: "0" },
      markerSymbol: {
        type: "marker",
        layers: [{ class: "SimpleMarker", properties: {} }],
      },
    },
  ];
  const reparsed = parseQgs(
    serializeQgs(parseJson(serializeJson(project)), { version: "4.2" }),
  );
  const tiles2 = layer(reparsed, "vector-tile");
  assert.deepEqual(
    tiles2.renderer?.type === "basic" &&
      tiles2.renderer.styles.map((style) => style.attributes?.name),
    ["roads", "water"],
  );
  assert.equal(layer(reparsed, "mesh").renderer?.nativeMesh?.enabled, "0");
  const text2 = layer(reparsed, "annotation").items!.find(
    (item) => item.attributes?.type === "pointtext",
  )!;
  assert.equal(text2.attributes?.text, "Bye");
  assert.equal(text2.format?.style?.fontSize, "20");
  assert.equal(reparsed.mainAnnotationItems?.[0]?.attributes?.type, "marker");
});
