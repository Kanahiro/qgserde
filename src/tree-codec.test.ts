import assert from "node:assert/strict";
import { test } from "node:test";
import { QgsError } from "./errors.ts";
import { ExtensionCodec } from "./extensions.ts";
import { readLayer } from "./layer-codec.ts";
import { readTree, writeTree } from "./tree-codec.ts";
import type {
  QgsLayerTreeGroup,
  QgsLayerTreeLayer,
  QgsMapLayer,
} from "./types.ts";
import { parseQgisVersion } from "./version.ts";
import { findChild, findChildren, getText, readXml } from "./xml.ts";

const target = parseQgisVersion("4.2");

function group(): QgsLayerTreeGroup {
  return {
    type: "group",
    name: "",
    expanded: true,
    checked: "checked",
    children: [],
  };
}

function reference(layerId: string): QgsLayerTreeLayer {
  return { type: "layer", layerId, expanded: true, checked: "checked" };
}

const layer: QgsMapLayer = {
  type: "vector",
  id: "v",
  name: "Cities",
  source: "Point",
  provider: "memory",
  fields: [],
};

test("reads nested groups, check states and custom order while ignoring extension elements", () => {
  const source = readXml(
    '<layer-tree-group><plugin/><layer-tree-layer id="a"/><layer-tree-group name="nested" expanded="0" checked="Qt::PartiallyChecked"><layer-tree-layer id="b" checked="Qt::Unchecked"/></layer-tree-group><custom-order enabled="1"><item>b</item><plugin/><item>a</item><item>b</item></custom-order></layer-tree-group>',
  ).root;
  const codec = new ExtensionCodec();
  const tree = readTree(source, codec);
  assert.deepEqual(tree, {
    ...group(),
    children: [
      reference("a"),
      {
        ...group(),
        name: "nested",
        expanded: false,
        checked: "partial",
        children: [{ ...reference("b"), checked: "unchecked" }],
      },
    ],
    customOrder: { enabled: true, layerIds: ["b", "a", "b"] },
  });
  assert.equal(codec.source(tree), source);
});

test("rejects unknown check states and invalid expanded or order booleans", () => {
  for (const xml of [
    '<layer-tree-group checked="checked"/>',
    '<layer-tree-group expanded="yes"/>',
    '<layer-tree-group><custom-order enabled="2"/></layer-tree-group>',
  ])
    assert.throws(
      () => readTree(readXml(xml).root, new ExtensionCodec()),
      (error) => error instanceof QgsError && error.code === "INVALID_PROJECT",
    );
});

test("new references receive typed layer connection values without changing the tree", () => {
  const tree = {
    ...group(),
    children: [
      { ...reference("v"), checked: "partial" as const, expanded: false },
    ],
  };
  const before = structuredClone(tree);
  const output = writeTree(
    tree,
    [layer],
    new Set(),
    new ExtensionCodec(),
    target,
  );
  assert.deepEqual(findChild(output, "layer-tree-layer")!.attributes, {
    id: "v",
    name: "Cities",
    source: "Point",
    providerKey: "memory",
    checked: "Qt::PartiallyChecked",
    expanded: "0",
  });
  assert.deepEqual(tree, before);
});

test("unknown new references fail, while embedded references from source XML survive", () => {
  const tree = { ...group(), children: [reference("external")] };
  assert.throws(
    () => writeTree(tree, [], new Set(), new ExtensionCodec(), target),
    (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
  );
  const source = readXml(
    '<layer-tree-group><layer-tree-layer id="external" source="external.qgs" plugin="keep"/></layer-tree-group>',
  ).root;
  const codec = new ExtensionCodec();
  const parsed = readTree(source, codec);
  if (parsed.type !== "group") throw new Error("Expected group");
  const output = writeTree(parsed, [], new Set(), codec, target);
  assert.equal(
    findChild(output, "layer-tree-layer")!.attributes.source,
    "external.qgs",
  );
  assert.equal(
    findChild(output, "layer-tree-layer")!.attributes.plugin,
    "keep",
  );
  assert.equal(
    findChild(output, "layer-tree-layer")!.attributes.checked,
    "Qt::Checked",
  );
});

test("removes deleted references and adds only new unreferenced layers", () => {
  const tree: QgsLayerTreeGroup = {
    ...group(),
    children: [reference("v"), reference("deleted")],
    customOrder: { enabled: true, layerIds: ["v", "deleted", "external"] },
  };
  const added = { ...layer, id: "added" };
  const hidden = { ...layer, id: "hidden" };
  const output = writeTree(
    tree,
    [layer, added, hidden],
    new Set(["v", "deleted", "hidden"]),
    new ExtensionCodec(),
    target,
  );
  assert.deepEqual(
    findChildren(output, "layer-tree-layer").map((node) => node.attributes.id),
    ["v", "added"],
  );
  assert.deepEqual(
    findChildren(findChild(output, "custom-order")!, "item").map(getText),
    ["v", "external", "added"],
  );
});

test("keeps provider-generated tree URIs when the typed layer source changes", () => {
  const codec = new ExtensionCodec();
  const source = readXml(
    '<layer-tree-group><layer-tree-layer id="v" name="Cities" source="Point?uid=provider-generated" providerKey="memory"/></layer-tree-group>',
  ).root;
  const tree = readTree(source, codec);
  if (tree.type !== "group") throw new Error("Expected group");
  const parsedLayer = readLayer(
    readXml(
      '<maplayer type="vector"><id>v</id><layername>Cities</layername><datasource>Point</datasource><provider>memory</provider></maplayer>',
    ).root,
    codec,
  );
  const write = () =>
    writeTree(tree, [parsedLayer], new Set(["v"]), codec, target);
  assert.equal(
    findChild(write(), "layer-tree-layer")!.attributes.source,
    "Point?uid=provider-generated",
  );
  // Tree nodes own their values; a layer edit does not rewrite them.
  parsedLayer.source = "./cities.gpkg";
  assert.equal(
    findChild(write(), "layer-tree-layer")!.attributes.source,
    "Point?uid=provider-generated",
  );
  assert.equal(
    findChild(source, "layer-tree-layer")!.attributes.source,
    "Point?uid=provider-generated",
  );
});

test("custom order keeps distinct duplicate payloads and unrelated siblings after reorder", () => {
  const source = readXml(
    '<layer-tree-group><custom-order enabled="1"><item plugin="first">v</item><gap/><item plugin="second">v</item><item plugin="other">other</item></custom-order></layer-tree-group>',
  ).root;
  const codec = new ExtensionCodec();
  const tree = readTree(source, codec);
  if (tree.type !== "group") throw new Error("Expected group");
  tree.customOrder!.layerIds = ["other", "v", "v"];
  const output = writeTree(tree, [layer], new Set(["v"]), codec, target);
  const order = findChild(output, "custom-order")!;
  assert.deepEqual(
    findChildren(order, "item").map((item) => item.attributes.plugin),
    ["other", "first", "second"],
  );
  assert.deepEqual(
    findChildren(order).map((item) => item.name),
    ["item", "gap", "item", "item"],
  );
  delete tree.customOrder;
  assert.equal(
    findChild(
      writeTree(tree, [layer], new Set(["v"]), codec, target),
      "custom-order",
    ),
    undefined,
  );
});

test("rejects cyclic and excessively deep trees while allowing repeated acyclic references", () => {
  const cyclic = group();
  cyclic.children.push(cyclic);
  assert.throws(
    () => writeTree(cyclic, [], new Set(), new ExtensionCodec(), target),
    /Cyclic/u,
  );
  const deep = group();
  let current = deep;
  for (let depth = 1; depth <= 512; depth++) {
    const next = group();
    current.children.push(next);
    current = next;
  }
  assert.throws(
    () => writeTree(deep, [], new Set(), new ExtensionCodec(), target),
    /excessively deep/u,
  );
  const node = reference("v");
  const tree = { ...group(), children: [node, node] };
  const output = writeTree(
    tree,
    [layer],
    new Set(),
    new ExtensionCodec(),
    target,
  );
  assert.equal(findChildren(output, "layer-tree-layer").length, 2);
});
