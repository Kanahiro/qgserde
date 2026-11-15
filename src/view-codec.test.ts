import assert from "node:assert/strict";
import { test } from "node:test";
import { QgsError } from "./errors.ts";
import { ExtensionCodec } from "./extensions.ts";
import { createProject } from "./project.ts";
import { parseQgisVersion } from "./version.ts";
import { readView, writeView } from "./view-codec.ts";
import { createElement, findChild, getText, readXml } from "./xml.ts";

const coordinates = { xmin: 1, ymin: 2, xmax: 3, ymax: 4 };

test("reads modern and legacy views with the CRS belonging to the chosen extent", () => {
  const root = readXml(
    '<qgis><ProjectViewSettings rotation="0"><DefaultViewExtent xmin="1" ymin="2" xmax="3" ymax="4"><spatialrefsys><wkt>modern CRS</wkt></spatialrefsys></DefaultViewExtent></ProjectViewSettings><mapcanvas><extent xmin="100" ymin="200" xmax="300" ymax="400"/><destinationsrs><spatialrefsys><wkt>legacy CRS</wkt></spatialrefsys></destinationsrs><rotation>99</rotation></mapcanvas></qgis>',
  ).root;
  assert.deepEqual(readView(root), {
    extent: { ...coordinates, crs: { wkt: "modern CRS" } },
    rotation: 0,
  });
  const fallback = readXml(
    '<qgis><ProjectViewSettings><Scales/></ProjectViewSettings><mapcanvas><extent xmin="1" ymin="2" xmax="3" ymax="4"/><destinationsrs><spatialrefsys><wkt>legacy CRS</wkt></spatialrefsys></destinationsrs><rotation>15</rotation></mapcanvas></qgis>',
  ).root;
  assert.deepEqual(readView(fallback), {
    extent: { ...coordinates, crs: { wkt: "legacy CRS" } },
    rotation: 15,
  });
  assert.deepEqual(readView(createElement("qgis")), {});
});

test("an explicit empty modern rotation does not fall back to a conflicting legacy value", () => {
  const root = readXml(
    '<qgis><ProjectViewSettings rotation=""/><mapcanvas><rotation>99</rotation></mapcanvas></qgis>',
  ).root;
  assert.equal(readView(root).rotation, undefined);
});

for (const [version, extentParent, rotationParent] of [
  ["3.10.0", "mapcanvas", "mapcanvas"],
  ["3.10.1", "ProjectViewSettings", "mapcanvas"],
  ["3.27.9", "ProjectViewSettings", "mapcanvas"],
  ["3.28.0", "ProjectViewSettings", "ProjectViewSettings"],
  ["4.0.0", "ProjectViewSettings", "ProjectViewSettings"],
] as const) {
  test(`writes extent and rotation to their supported locations for ${version}`, () => {
    for (const setting of ["extent", "rotation", "both"]) {
      const root = createElement("qgis");
      const project = createProject();
      if (setting !== "rotation") project.extent = { ...coordinates };
      if (setting !== "extent") project.rotation = 0;
      const before = structuredClone(project);
      writeView(root, project, parseQgisVersion(version), new ExtensionCodec());
      if (project.extent) {
        const parent = findChild(root, extentParent)!;
        assert.ok(
          findChild(
            parent,
            extentParent === "mapcanvas" ? "extent" : "DefaultViewExtent",
          ),
        );
      }
      if (project.rotation !== undefined) {
        const parent = findChild(root, rotationParent)!;
        assert.equal(
          rotationParent === "mapcanvas"
            ? getText(findChild(parent, "rotation")!)
            : parent.attributes.rotation,
          "0",
        );
      }
      assert.deepEqual(project, before);
    }
  });
}

test("new extents inherit the project CRS while explicit extent CRS takes precedence", () => {
  for (const crs of [undefined, { wkt: "extent CRS" }]) {
    const root = createElement("qgis");
    const project = createProject();
    project.crs = { wkt: "project CRS" };
    project.extent = { ...coordinates, ...(crs ? { crs } : {}) };
    writeView(root, project, parseQgisVersion("4.2"), new ExtensionCodec());
    assert.equal(readView(root).extent!.crs!.wkt, crs?.wkt ?? "project CRS");
  }
});

test("refuses to remove a default extent when independent legacy state would replace it", () => {
  const root = readXml(
    '<qgis><mapcanvas><extent xmin="100" ymin="200" xmax="300" ymax="400"/></mapcanvas></qgis>',
  ).root;
  const before = structuredClone(root);
  assert.throws(
    () =>
      writeView(
        root,
        createProject(),
        parseQgisVersion("4.2"),
        new ExtensionCodec(),
      ),
    (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
  );
  assert.deepEqual(root, before);
});

test("downgrades reject independent legacy extent and rotation conflicts", () => {
  for (const [version, payload] of [
    ["3.10.0", '<extent xmin="100" ymin="200" xmax="300" ymax="400"/>'],
    ["3.27.9", "<rotation>99</rotation>"],
  ]) {
    const root = readXml(`<qgis><mapcanvas>${payload}</mapcanvas></qgis>`).root;
    const project = { ...createProject(), extent: coordinates, rotation: 15 };
    const before = structuredClone(root);
    assert.throws(
      () =>
        writeView(
          root,
          project,
          parseQgisVersion(version!),
          new ExtensionCodec(),
        ),
      /without data loss/u,
    );
    assert.deepEqual(root, before);
  }
});
