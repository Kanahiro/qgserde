import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProject,
  parseQgs,
  QgsError,
  serializeQgs,
} from "../src/index.ts";
import { findChild, findChildren, getText, readXml } from "../src/xml.ts";

function roundTrip(xml: string): string {
  return serializeQgs(JSON.parse(JSON.stringify(parseQgs(xml))), {
    version: readXml(xml).root.attributes.version!,
  });
}

test("partitions modeled values and extension positions without retaining XML snapshots", () => {
  const xml =
    '<qgis version="3.40.7"><projectMetadata><author>unique-author</author></projectMetadata><properties><SpatialRefSys><ProjectionsEnabled>1</ProjectionsEnabled></SpatialRefSys></properties><projectCrs><spatialrefsys><wkt>unique-wkt-definition</wkt></spatialrefsys></projectCrs><projectlayers><maplayer type="vector"><id>v</id><renderer-v2 type="unique-renderer"><symbols><symbol name="keep"/></symbols></renderer-v2><fieldConfiguration><field name="a"><editWidget type="unique-widget"/></field></fieldConfiguration><aliases><alias field="a" name="unique-alias"/></aliases></maplayer></projectlayers></qgis>';
  const project = parseQgs(xml);
  const stored = JSON.stringify(project);
  assert.ok(!stored.includes("preservedXml"));
  assert.ok(!stored.includes('"type":"element"'));
  assert.ok(!stored.includes("3.40.7"));
  for (const value of [
    "unique-author",
    "unique-wkt-definition",
    "unique-renderer",
    "unique-widget",
    "unique-alias",
  ])
    assert.equal(stored.split(value).length - 1, 1, value);
  const root = readXml(roundTrip(xml)).root;
  assert.equal(
    getText(findChild(findChild(root, "projectMetadata")!, "author")!),
    "unique-author",
  );
  const layer = findChild(findChild(root, "projectlayers")!, "maplayer")!;
  assert.ok(findChild(findChild(layer, "renderer-v2")!, "symbols"));
});

test("retains namespaces, unknown strings, nested and mixed content, and sibling order after JSON storage", () => {
  const xml =
    '<?xml version="1.0"?><qgis version="4.2.0" xmlns:p="urn:plugin"><p:first k="0001">before<p:nested/>after<![CDATA[&data]]></p:first><title>A<!--title-->B<?plugin kept?>C</title><p:second flag="false"/><projectMetadata><author>checked</author></projectMetadata><p:first k="false"/></qgis>';
  assert.deepEqual(
    readXml(roundTrip(xml)),
    readXml(
      xml.replace(
        '<?xml version="1.0"?>',
        '<?xml version="1.0" encoding="UTF-8"?>',
      ),
    ),
  );
  const project = parseQgs(xml);
  project.title = "changed";
  const root = readXml(serializeQgs(project, { version: "4.2" })).root;
  assert.deepEqual(
    findChildren(root)
      .slice(0, 5)
      .map((node) => node.name),
    ["p:first", "title", "p:second", "projectMetadata", "p:first"],
  );
  assert.equal(getText(findChild(root, "title")!), "changed");
  assert.equal(
    getText(findChild(findChild(root, "projectMetadata")!, "author")!),
    "checked",
  );
  assert.match(serializeQgs(project, { version: "4.2" }), /<!--title-->/u);
  assert.match(serializeQgs(project, { version: "4.2" }), /<\?plugin kept\?>/u);
});

test("keeps unknown layer and field payloads attached to their identities through rename and reorder", () => {
  const xml =
    '<qgis version="4.2.0"><projectlayers><maplayer type="vector" plugin="first"><id>a</id><fieldConfiguration><field name="one"><plugin-field/></field><field name="two"/></fieldConfiguration><aliases><alias field="two" name="Two" plugin="two"/><alias field="one" name="One" plugin="one"/></aliases></maplayer><between value="keep"/><maplayer type="vector" plugin="second"><id>b</id></maplayer></projectlayers></qgis>';
  const project = JSON.parse(JSON.stringify(parseQgs(xml)));
  project.layers.reverse();
  const first = project.layers[1];
  first.id = "renamed";
  first.fields.reverse();
  first.fields[1].name = "renamed-field";
  const root = readXml(serializeQgs(project, { version: "4.2" })).root;
  const container = findChild(root, "projectlayers")!;
  assert.deepEqual(
    findChildren(container).map((node) => node.name),
    ["maplayer", "between", "maplayer"],
  );
  const layers = findChildren(container, "maplayer");
  assert.deepEqual(
    layers.map((node) => node.attributes.plugin),
    ["second", "first"],
  );
  const fields = findChildren(
    findChild(layers[1]!, "fieldConfiguration")!,
    "field",
  );
  assert.deepEqual(
    fields.map((field) => field.attributes.name),
    ["two", "renamed-field"],
  );
  assert.ok(findChild(fields[1]!, "plugin-field"));
  assert.deepEqual(
    findChildren(findChild(layers[1]!, "aliases")!, "alias").map((alias) => [
      alias.attributes.field,
      alias.attributes.plugin,
    ]),
    [
      ["two", "two"],
      ["renamed-field", "one"],
    ],
  );
});

test("rejects scalar edits that would erase nested extension elements", () => {
  const xml =
    '<qgis version="4.2.0"><title>A<plugin-part key="keep">B</plugin-part>C</title></qgis>';
  assert.deepEqual(readXml(roundTrip(xml)), readXml(xml));
  const project = parseQgs(xml);
  project.title = "replace";
  const before = JSON.stringify(project);
  assert.throws(
    () => serializeQgs(project, { version: "4.2" }),
    (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
  );
  assert.equal(JSON.stringify(project), before);
});

test("retains independent legacy view state and rejects a downgrade that cannot represent both meanings", () => {
  const xml =
    '<qgis version="4.2.0"><ProjectViewSettings rotation="11"><DefaultViewExtent xmin="1" ymin="2" xmax="3" ymax="4"/></ProjectViewSettings><mapcanvas custom="keep"><extent><xmin>100</xmin><ymin>200</ymin><xmax>300</xmax><ymax>400</ymax></extent><rotation>99</rotation></mapcanvas></qgis>';
  assert.deepEqual(readXml(roundTrip(xml)), readXml(xml));
  const project = parseQgs(xml);
  project.rotation = 45;
  project.extent!.xmin = -1;
  const root = readXml(serializeQgs(project, { version: "4.2" })).root;
  assert.equal(
    findChild(root, "ProjectViewSettings")!.attributes.rotation,
    "45",
  );
  assert.deepEqual(
    findChild(root, "mapcanvas"),
    findChild(readXml(xml).root, "mapcanvas"),
  );
  assert.throws(
    () => serializeQgs(project, { version: "3.8" }),
    /without data loss/u,
  );
});

test("creates isolated models from optional options without synthesizing or retaining source XML", () => {
  const first = createProject();
  const second = createProject({ title: "named" });
  assert.equal(first.extensions, undefined);
  assert.equal(second.extensions, undefined);
  first.layerTree!.name = "edited";
  assert.equal(second.layerTree!.name, "");
  const stored = JSON.parse(JSON.stringify(second));
  for (const version of ["3.8", "3.44", "4.2"])
    assert.equal(parseQgs(serializeQgs(stored, { version })).title, "named");
});

test("does not silently claim orphan extension records when adding a field", () => {
  const xml =
    '<qgis version="4.2.0"><projectlayers><maplayer type="vector"><id>v</id><aliases><alias field="external" name="Keep" plugin="unknown"/></aliases></maplayer></projectlayers></qgis>';
  assert.deepEqual(readXml(roundTrip(xml)), readXml(xml));
  const project = parseQgs(xml);
  const layer = project.layers[0]!;
  if (layer.type !== "vector") throw new Error("vector expected");
  layer.fields.push({ name: "external" });
  assert.throws(
    () => serializeQgs(project, { version: "4.2" }),
    /conflicts with an unmodeled alias/u,
  );
});

test("retains legacy layer type spellings and rejects cyclic extension placement data", () => {
  const xml =
    '<qgis version="4.2.0"><projectlayers><maplayer type="pointcloud"><id>cloud</id><custom key="keep"/></maplayer></projectlayers></qgis>';
  assert.deepEqual(readXml(roundTrip(xml)), readXml(xml));
  const project = parseQgs(xml);
  const layout = project.extensions!.layout!;
  layout.content.push(layout);
  assert.throws(() => serializeQgs(project, { version: "4.2" }), /Cyclic/u);
});

test("retains repeated references, incomplete records, and their distinct payloads in occurrence order", () => {
  const xml =
    '<qgis version="4.2.0"><layer-tree-group><layer-tree-layer id="v"/><custom-order enabled="1"><item plugin="first">v</item><gap/><item plugin="second">v</item><item plugin="external">external</item></custom-order></layer-tree-group><projectlayers><maplayer type="vector"><id>v</id><fieldConfiguration><field name="a"/><field name="b"/></fieldConfiguration><aliases><alias field="a" name="A" plugin="first"/><gap/><alias field="a" name="Other" plugin="second"/><alias field="b" plugin="incomplete"/></aliases><defaults><default field="a" expression="first" plugin="first"/><default field="a" expression="second" plugin="second"/></defaults></maplayer></projectlayers><layerorder><layer id="v" plugin="first"/><gap/><layer id="v" plugin="second"/><layer id="external" plugin="external"/></layerorder></qgis>';
  assert.deepEqual(readXml(roundTrip(xml)), readXml(xml));
  const project = parseQgs(xml);
  project.layers[0]!.id = "renamed";
  const root = readXml(serializeQgs(project, { version: "4.2" })).root;
  assert.deepEqual(
    findChildren(findChild(root, "layerorder")!, "layer").map((node) => [
      node.attributes.id,
      node.attributes.plugin,
    ]),
    [
      ["renamed", "first"],
      ["renamed", "second"],
      ["external", "external"],
    ],
  );
  const order = findChild(
    findChild(root, "layer-tree-group")!,
    "custom-order",
  )!;
  assert.deepEqual(
    findChildren(order, "item").map((node) => [
      getText(node),
      node.attributes.plugin,
    ]),
    [
      ["renamed", "first"],
      ["renamed", "second"],
      ["external", "external"],
    ],
  );
});

test("retains ignored empty view values and does not invent unsupported modern rotation settings", () => {
  const xml =
    '<qgis version="4.2.0"><ProjectViewSettings rotation=""/><mapcanvas><rotation>99</rotation></mapcanvas></qgis>';
  assert.deepEqual(readXml(roundTrip(xml)), readXml(xml));
  const legacy = createProject();
  legacy.extent = { xmin: 1, ymin: 2, xmax: 3, ymax: 4 };
  legacy.rotation = 15;
  const root = readXml(serializeQgs(legacy, { version: "3.26" })).root;
  assert.equal(
    findChild(root, "ProjectViewSettings")!.attributes.rotation,
    undefined,
  );
  assert.equal(
    getText(findChild(findChild(root, "mapcanvas")!, "rotation")!),
    "15",
  );
});

test("rejects malformed extension data instead of silently omitting it", () => {
  const project = JSON.parse(
    JSON.stringify(parseQgs('<qgis version="4.2.0"><unknown/></qgis>')),
  );
  delete project.extensions.layout;
  assert.throws(
    () => serializeQgs(project, { version: "4.2" }),
    /placement data is missing/u,
  );
});
