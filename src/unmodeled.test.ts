import assert from "node:assert/strict";
import { test } from "node:test";
import { QgsError } from "./errors.ts";
import { parseQgs, serializeQgs } from "./project.ts";
import { findChild, findChildren, readXml } from "./xml.ts";

const xml =
  '<qgis version="4.2.0"><projectlayers><maplayer type="raster" plugin="a"><id>raster_layer_001</id><plugin:x xmlns:plugin="urn:p">1</plugin:x><provider>gdal</provider><srs><spatialrefsys extra="y"><authid>EPSG:4326</authid><!--note--></spatialrefsys></srs></maplayer></projectlayers></qgis>';

const layerOf = (output: string) =>
  findChild(findChild(readXml(output).root, "projectlayers")!, "maplayer")!;

test("keeps unmodeled layer XML as plain data next to its modeled sibling", () => {
  const layer = parseQgs(xml).layers[0]!;
  assert.deepEqual(layer.unmodeled, {
    "": {
      attributes: { plugin: "a" },
      children: [
        {
          after: "id",
          node: {
            type: "element",
            name: "plugin:x",
            attributes: { "xmlns:plugin": "urn:p" },
            children: [{ type: "text", value: "1" }],
          },
        },
      ],
    },
    "srs/spatialrefsys": {
      attributes: { extra: "y" },
      children: [{ after: "authid", node: { type: "comment", value: "note" } }],
    },
  });
  const element = layerOf(
    serializeQgs({ ...parseQgs(xml) }, { version: "4.2" }),
  );
  assert.equal(element.attributes.plugin, "a");
  const names = findChildren(element).map((child) => child.name);
  assert.equal(names[names.indexOf("id") + 1], "plugin:x");
});

test("unmodeled data follows copies and goes with removed elements", () => {
  const project = parseQgs(xml);
  const { crs: _, ...copy } = structuredClone(project.layers[0]!);
  project.layers.push({ ...copy, id: "raster_layer_002" });
  const output = serializeQgs(project, { version: "4.2" });
  const [first, second] = findChildren(
    findChild(readXml(output).root, "projectlayers")!,
    "maplayer",
  );
  for (const layer of [first!, second!])
    assert.equal(
      findChild(layer, "plugin:x")?.attributes["xmlns:plugin"],
      "urn:p",
    );
  assert.match(output, /extra="y"/u);
  assert.equal(findChild(second!, "srs"), undefined);
  assert.equal(output.match(/extra="y"/gu)?.length, 1);
});

test("modeled values win over unmodeled attributes and malformed data fails", () => {
  const project = parseQgs(xml);
  const layer = project.layers[0]!;
  layer.unmodeled![""]!.attributes!.type = "vector";
  assert.equal(
    layerOf(serializeQgs(project, { version: "4.2" })).attributes.type,
    "raster",
  );
  for (const unmodeled of [
    { "": { children: [{ node: { type: "bogus" } }] } },
    { "a]": { attributes: {} } },
    { "": { attributes: { a: 1 } } },
  ]) {
    layer.unmodeled = unmodeled as never;
    assert.throws(
      () => serializeQgs(project, { version: "4.2" }),
      (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
    );
  }
});

test("unmodeled data of field records follows its field through reorder and rename", () => {
  const project = parseQgs(
    '<qgis version="4.2.0"><projectlayers><maplayer type="vector"><id>vector_layer_001</id><fieldConfiguration><field name="a"/><field name="b"/></fieldConfiguration><aliases><alias field="a" name="A" plugin="of-a"/><alias field="b" name="B" plugin="of-b"><note/></alias></aliases></maplayer></projectlayers></qgis>',
  );
  const layer = project.layers[0]!;
  if (layer.type !== "vector") throw new Error("vector");
  assert.equal(layer.unmodeled?.["aliases/alias"], undefined);
  assert.deepEqual(layer.fields[0]!.unmodeled, {
    "aliases/alias": { attributes: { plugin: "of-a" } },
  });
  layer.fields.reverse();
  layer.fields[1]!.name = "renamed";
  const aliases = findChildren(
    findChild(layerOf(serializeQgs(project, { version: "4.2" })), "aliases")!,
    "alias",
  );
  assert.deepEqual(
    aliases.map((alias) => [
      alias.attributes.field,
      alias.attributes.plugin,
      findChildren(alias).map((child) => child.name),
    ]),
    [
      ["b", "of-b", ["note"]],
      ["renamed", "of-a", []],
    ],
  );
});
