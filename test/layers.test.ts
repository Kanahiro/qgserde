import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addLayer,
  createElement,
  createLayer,
  createProject,
  findChild,
  findChildren,
  getLayers,
  getText,
  parseQgs,
  serializeQgs,
  updateLayer,
} from "../src/index.ts";

const definition = {
  id: "cities_001",
  name: "都市",
  type: "vector",
  provider: "memory",
  source: "Point?crs=EPSG:4326",
  crs: "EPSG:4326",
} as const;

test("adds layers to definitions, tree, and both stored order lists", () => {
  const project = createProject("4.2");
  project.root.children.push(createElement("layerorder"));
  const original = createLayer(definition);
  const attached = addLayer(project, original);
  assert.notEqual(attached, original);
  assert.equal(getLayers(project)[0], attached);
  const tree = findChild(project.root, "layer-tree-group")!;
  assert.deepEqual(findChild(tree, "layer-tree-layer")!.attributes, {
    id: "cities_001",
    name: "都市",
    providerKey: "memory",
    source: definition.source,
    checked: "Qt::Checked",
    expanded: "1",
  });
  assert.equal(
    getText(findChild(findChild(tree, "custom-order")!, "item")!),
    definition.id,
  );
  assert.equal(
    findChild(findChild(project.root, "layerorder")!, "layer")!.attributes.id,
    definition.id,
  );
  assert.deepEqual(parseQgs(serializeQgs(project)), project);
});

test("updates every nested tree reference while preserving styles and unrelated content", () => {
  const project = createProject("3.40");
  const attached = addLayer(project, createLayer(definition));
  attached.children.push(
    createElement("renderer-v2", { type: "singleSymbol" }),
  );
  const tree = findChild(project.root, "layer-tree-group")!;
  const reference = structuredClone(findChild(tree, "layer-tree-layer")!);
  const group = createElement("layer-tree-group", { name: "nested" }, [
    reference,
  ]);
  tree.children.push(
    group,
    createElement("layer-tree-layer", { id: "other", name: "untouched" }),
  );
  const result = updateLayer(project, definition.id, {
    name: "",
    source: "./cities.gpkg|layername=cities",
    provider: "ogr",
  });
  assert.equal(getText(findChild(result, "layername")!), "");
  assert.equal(
    getText(findChild(result, "datasource")!),
    "./cities.gpkg|layername=cities",
  );
  assert.equal(reference.attributes.name, "");
  assert.equal(reference.attributes.providerKey, "ogr");
  assert.equal(
    findChild(result, "renderer-v2")!.attributes.type,
    "singleSymbol",
  );
  assert.equal(
    findChildren(tree, "layer-tree-layer")[1]!.attributes.name,
    "untouched",
  );
  assert.deepEqual(parseQgs(serializeQgs(project)), project);
});

test("rejects empty or duplicate IDs before changing the project", () => {
  const project = createProject("4.2");
  addLayer(project, createLayer(definition));
  const before = JSON.stringify(project);
  assert.throws(() => addLayer(project, createLayer(definition)), /duplicate/u);
  assert.equal(JSON.stringify(project), before);
  assert.throws(
    () => createLayer({ ...definition, id: " " }),
    /must not be empty/u,
  );
  assert.throws(() => createLayer({ ...definition, crs: "" }), /CRS/u);
  assert.throws(() => addLayer(project, createElement("other")), /maplayer/u);
  assert.throws(
    () => updateLayer(project, "missing", { name: "x" }),
    /found 0/u,
  );
});

test("adds missing containers to a minimal parsed project", () => {
  const project = parseQgs('<qgis version="3.40"/>');
  addLayer(project, createLayer(definition));
  assert.equal(getLayers(project).length, 1);
  assert.ok(
    findChild(findChild(project.root, "layer-tree-group")!, "layer-tree-layer"),
  );
});

test("round trips a project written by QGIS 4 with Unicode release and layer names", async () => {
  const { readFile } = await import("node:fs/promises");
  const xml = await readFile(
    new URL("./fixtures/qgis4.qgs", import.meta.url),
    "utf8",
  );
  const project = parseQgs(xml);
  assert.equal(project.root.attributes.version, "4.2.0-Belém do Pará");
  assert.equal(getLayers(project).length, 1);
  assert.deepEqual(parseQgs(serializeQgs(project)), project);
});
