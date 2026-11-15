import assert from "node:assert/strict";
import { test } from "node:test";
import { QgsError } from "./errors.ts";
import { createProject } from "./project.ts";

test("creates empty projects with optional settings and validates their types", () => {
  for (const project of [
    createProject(),
    createProject({}),
    createProject(undefined),
  ]) {
    assert.equal(project.title, "");
    assert.deepEqual(project.layers, []);
    assert.deepEqual(project.metadata, {});
    assert.equal("preservedXml" in project, false);
  }
  assert.equal(createProject({ title: "named" }).title, "named");
  for (const options of [null, [], "a title"])
    assert.throws(
      () => Reflect.apply(createProject, undefined, [options]),
      (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
    );
  assert.equal(createProject({ title: "" }).title, "");
  for (const title of [42, null, false])
    assert.throws(
      () => Reflect.apply(createProject, undefined, [{ title }]),
      (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
    );
});

test("new projects own their mutable metadata, layers and tree nodes", () => {
  const first = createProject();
  const second = createProject();
  first.metadata.author = "changed";
  first.layers.push({
    type: "raster",
    id: "r",
    name: "Raster",
    provider: "gdal",
    source: "file.tif",
  });
  first.layerTree!.name = "changed";
  first.layerTree!.children.push({
    type: "layer",
    layerId: "r",
    checked: "checked",
    expanded: true,
  });
  assert.deepEqual(second, {
    title: "",
    metadata: {},
    layers: [],
    layerTree: {
      type: "group",
      name: "",
      checked: "checked",
      expanded: true,
      children: [],
    },
  });
});
