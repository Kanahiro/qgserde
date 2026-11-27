import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createProject,
  parseQgs,
  type QgsLayerServerProperties,
  type QgsVectorLayer,
  serializeQgs,
} from "../src/index.ts";
import { findChild, findChildren, readXml } from "../src/xml.ts";

const definition: QgsVectorLayer = {
  id: "cities_layer_001",
  name: "都市",
  type: "vector",
  provider: "memory",
  source: "Point?crs=EPSG:4326",
  crs: { authId: "EPSG:4326" },
  fields: [],
};

test("legacy fields are modeled while custom order payloads and embedded references survive", () => {
  const xml =
    '<qgis version="4.2.0"><layer-tree-group><custom-order><item plugin="keep"><![CDATA[vector_layer_001]]></item></custom-order><layer-tree-layer id="vector_layer_001"/><layer-tree-group><layer-tree-layer id="external" source="external.qgs"/></layer-tree-group></layer-tree-group><projectlayers><maplayer type="vector"><id>vector_layer_001</id><aliases><alias field="older" name="keep"/></aliases><defaults><default field="older" expression="001" applyOnUpdate="0"/></defaults></maplayer><maplayer embedded="1" project="other.qgs" id="embedded_layer_001"/></projectlayers><layerorder><layer id="vector_layer_001" plugin="keep"/></layerorder></qgis>';
  const project = parseQgs(xml);
  assert.equal(project.layers[1]!.id, "embedded_layer_001");
  const output = serializeQgs(project, { version: "4.2" });
  const root = readXml(output).root;
  const layer = project.layers[0]!;
  assert.equal(layer.type === "vector" && layer.fields[0]?.alias, "keep");
  assert.equal(
    layer.type === "vector" && layer.fields[0]?.defaultExpression,
    "001",
  );
  assert.match(
    output,
    /<item plugin="keep"><!\[CDATA\[vector_layer_001\]\]><\/item>/u,
  );
  const embedded = findChildren(
    findChild(root, "projectlayers")!,
    "maplayer",
  )[1]!;
  assert.equal(embedded.attributes.project, "other.qgs");
  assert.match(output, /source="external.qgs"/u);
});

test("keeps every alias record, written in field order", () => {
  const xml =
    '<qgis version="4.2.0"><projectlayers><maplayer type="vector"><id>vector_layer_001</id><fieldConfiguration><field name="a"/><field name="b"/></fieldConfiguration><aliases><alias field="external" name="keep"/><alias field="b" name="B"/><alias field="a" name="A"/></aliases></maplayer></projectlayers></qgis>';
  const root = readXml(serializeQgs(parseQgs(xml), { version: "4.2" })).root;
  const layer = findChild(findChild(root, "projectlayers")!, "maplayer")!;
  // QGIS reads aliases by field name, so their order carries no meaning.
  assert.deepEqual(
    findChildren(findChild(layer, "aliases")!, "alias").map(
      (alias) => alias.attributes,
    ),
    [
      { field: "a", index: "0", name: "A" },
      { field: "b", index: "1", name: "B" },
      { field: "external", index: "2", name: "keep" },
    ],
  );
});

test("pushes plain typed layers and builds their XML and tree references", () => {
  const project = createProject();
  project.layers.push(structuredClone(definition));
  project.layerOrder = [];
  project.layerTree!.customOrder = { enabled: true, layerIds: [] };
  const before = JSON.stringify(project);
  const result = parseQgs(serializeQgs(project, { version: "4.2" }));
  assert.equal(result.layers[0]!.id, "cities_layer_001");
  assert.equal(result.layers[0]!.name, "都市");
  assert.deepEqual(result.layerOrder, ["cities_layer_001"]);
  assert.deepEqual(result.layerTree!.customOrder, {
    enabled: true,
    layerIds: ["cities_layer_001"],
  });
  const node = result.layerTree!.children[0]!;
  assert.equal(node.type, "layer");
  if (node.type === "layer") assert.equal(node.layerId, "cities_layer_001");
  assert.equal(JSON.stringify(project), before);
});

test("typed edits synchronize every nested tree reference and keep renderer symbols", () => {
  const xml = readFileSync(
    new URL("./fixtures/qgis4.qgs", import.meta.url),
    "utf8",
  );
  const project = parseQgs(xml);
  const layer = project.layers[0]!;
  assert.equal(layer.type, "vector");
  if (layer.type !== "vector") throw new Error("Expected vector fixture");
  assert.equal(layer.renderer!.type, "singleSymbol");
  const reference = structuredClone(project.layerTree!.children[0]!);
  project.layerTree!.children.push({
    type: "group",
    name: "nested",
    expanded: true,
    checked: "partial",
    children: [reference],
  });
  layer.name = "";
  layer.source = "./cities.gpkg|layername=cities";
  layer.provider = "ogr";
  layer.opacity = 0.5;
  layer.labelsEnabled = true;
  layer.renderer!.symbolLevels = true;
  const output = serializeQgs(project, { version: "4.2" });
  const root = readXml(output).root;
  const tree = findChild(root, "layer-tree-group")!;
  const nested = findChild(tree, "layer-tree-group")!;
  for (const parent of [tree, nested]) {
    const attributes = findChild(parent, "layer-tree-layer")!.attributes;
    assert.equal(attributes.name, "");
    assert.equal(attributes.source, layer.source);
    assert.equal(attributes.providerKey, "ogr");
  }
  const updated = parseQgs(output).layers[0]!;
  assert.equal(updated.opacity, 0.5);
  assert.equal(updated.type === "vector" && updated.labelsEnabled, true);
  const originalSymbols = findChild(
    findChild(findChild(readXml(xml).root, "projectlayers")!, "maplayer")!,
    "renderer-v2",
  )!;
  const outputSymbols = findChild(
    findChild(findChild(root, "projectlayers")!, "maplayer")!,
    "renderer-v2",
  )!;
  assert.deepEqual(
    findChild(outputSymbols, "symbols"),
    findChild(originalSymbols, "symbols"),
  );
});

test("removing typed layers removes their tree and order IDs", () => {
  const project = parseQgs(
    readFileSync(new URL("./fixtures/qgis3.qgs", import.meta.url), "utf8"),
  );
  const [kept] = project.layers.splice(1, 1) && project.layers;
  const id = kept!.id;
  const result = parseQgs(serializeQgs(project, { version: "4.2" }));
  assert.deepEqual(
    result.layers.map((layer) => layer.id),
    [id],
  );
  assert.deepEqual(result.layerOrder, [id]);
  assert.deepEqual(result.layerTree!.customOrder!.layerIds, [id]);
  assert.equal(result.layerTree!.children.length, 1);
  const child = result.layerTree!.children[0]!;
  assert.equal(child.type === "layer" && child.layerId, id);
});

test("rejects duplicate IDs, empty IDs and cyclic typed trees", () => {
  const project = createProject();
  project.layers.push(structuredClone(definition), structuredClone(definition));
  assert.throws(
    () => serializeQgs(project, { version: "4.2" }),
    /Duplicate layer ID/u,
  );
  project.layers.pop();
  project.layers[0] = { ...project.layers[0]!, id: "" };
  assert.throws(
    () => serializeQgs(project, { version: "4.2" }),
    /must not be empty/u,
  );
  project.layers = [];
  project.layerTree!.children.push(project.layerTree!);
  assert.throws(() => serializeQgs(project, { version: "4.2" }), /Cyclic/u);
});

test("short IDs are rejected even when read unchanged from XML or JSON", () => {
  const xml =
    '<qgis version="3.44.0"><layer-tree-group><layer-tree-layer id="states"/></layer-tree-group><projectlayers><maplayer type="raster"><id>states</id><provider>wms</provider></maplayer></projectlayers></qgis>';
  const project = JSON.parse(JSON.stringify(parseQgs(xml)));
  assert.throws(
    () => serializeQgs(project, { version: "3.44" }),
    /at least 11/u,
  );
  const before = JSON.stringify(project);
  assert.throws(
    () => serializeQgs(project, { version: "3.44" }),
    /at least 11/u,
  );
  assert.equal(JSON.stringify(project), before);
  assert.throws(
    () => serializeQgs(project, { version: "3.44" }),
    /at least 11/u,
  );
});

test("raster layers have typed band settings; future types have an explicit fallback", () => {
  const project = parseQgs(
    '<qgis version="4.2.0"><projectlayers><maplayer type="raster"><id>raster_layer_001</id><layername>raster</layername><provider>gdal</provider><datasource>file.tif</datasource><pipe><rasterrenderer type="multibandcolor" opacity="0.75" redBand="1" greenBand="2" blueBand="3"><custom value="keep"/></rasterrenderer></pipe></maplayer><maplayer type="future"><id>unknown_layer_001</id><plugin-data/></maplayer></projectlayers></qgis>',
  );
  const layer = project.layers[0]!;
  assert.equal(layer.type, "raster");
  if (layer.type !== "raster") throw new Error("Expected raster");
  assert.equal(layer.renderer!.redBand, 1);
  assert.equal(layer.renderer!.opacity, 0.75);
  layer.renderer!.redBand = 3;
  layer.renderer!.blueBand = 1;
  const unknown = project.layers[1]!;
  assert.equal(unknown.type, "unknown");
  if (unknown.type === "unknown") assert.equal(unknown.xmlType, "future");
  const output = serializeQgs(project, { version: "4.2" });
  const updated = parseQgs(output).layers[0]!;
  assert.equal(updated.type === "raster" && updated.renderer!.redBand, 3);
  assert.match(output, /<custom value="keep"\/>/u);
  assert.match(output, /<plugin-data\/>/u);
});

test("field configurations, aliases and defaults have editable types", () => {
  const project = parseQgs(
    '<qgis version="3.40"><projectlayers><maplayer type="vector"><id>vector_layer_001</id><fieldConfiguration><field name="name"><editWidget type="TextEdit"><config><Option type="Map"/></config></editWidget></field></fieldConfiguration><aliases><alias field="name" index="0" name="名称"/></aliases><defaults><default field="name" expression="\'A\'" applyOnUpdate="1"/></defaults></maplayer></projectlayers></qgis>',
  );
  const layer = project.layers[0]!;
  if (layer.type !== "vector") throw new Error("Expected vector");
  assert.equal(layer.fields[0]!.editorWidgetType, "TextEdit");
  assert.equal(layer.fields[0]!.applyDefaultOnUpdate, true);
  layer.fields[0]!.alias = "都市名";
  layer.fields[0]!.defaultExpression = "'B'";
  layer.fields.push({ name: "population", editorWidgetType: "Range" });
  const output = serializeQgs(project, { version: "4.2" });
  const updated = parseQgs(output).layers[0]!;
  if (updated.type !== "vector") throw new Error("Expected vector");
  assert.equal(updated.fields[0]!.alias, "都市名");
  assert.equal(updated.fields[0]!.defaultExpression, "'B'");
  assert.equal(updated.fields[1]!.editorWidgetType, "Range");
  assert.match(output, /<config>\s*<Option type="Map"\/>\s*<\/config>/u);
});

test("fresh vector tiles include native symbology required by QGIS 3 and preserve existing styles and multi-source URIs", () => {
  const project = createProject();
  const source =
    "type=xyz&url=https://tiles.example.com/{z}/{x}/{y}.pbf&urlName=base&url_2=https://tiles.example.com/overlay/{z}/{x}/{y}.pbf&urlName_2=overlay&styleUrl=https%3A%2F%2Ftiles.example.com%2Fstyle.json";
  project.layers.push({
    id: "vector_tiles_001",
    name: "Tiles",
    type: "vector-tile",
    provider: "xyzvectortiles",
    source,
  });
  const output = serializeQgs(project, { version: "3.44" });
  const layer = findChild(
    findChild(readXml(output).root, "projectlayers")!,
    "maplayer",
  )!;
  const renderer = findChild(layer, "renderer")!;
  assert.equal(renderer.attributes.type, "basic");
  assert.equal(findChildren(findChild(renderer, "styles")!).length, 3);
  assert.equal(parseQgs(output).layers[0]!.source, source);
  const custom = output.replace(
    '<renderer type="basic">',
    '<renderer type="basic" custom="keep">',
  );
  const parsed = parseQgs(custom);
  assert.deepEqual(parseQgs(serializeQgs(parsed, { version: "3.44" })), parsed);
  assert.match(serializeQgs(parsed, { version: "3.44" }), /custom="keep"/u);
});

test("group server settings are one model across their QGIS storage forms", () => {
  const groupOf = (xml: string) =>
    findChild(
      findChild(readXml(xml).root, "layer-tree-group")!,
      "layer-tree-group",
    )!;
  // QGIS 3.2 stores the short name, title, and abstract as custom properties.
  const project = parseQgs(
    readFileSync(
      new URL("./fixtures/qgis3-raster.qgs", import.meta.url),
      "utf8",
    ),
  );
  const group = project.layerTree!.children[0]!;
  assert.equal(group.type, "group");
  if (group.type !== "group") return;
  const server: QgsLayerServerProperties = group.server!;
  assert.deepEqual(
    { ...server },
    {
      shortName: "group_name",
      title: "Group title",
      abstract: "My so beautiful and useful abstract",
    },
  );
  assert.equal(group.customProperties, undefined);
  const modern = groupOf(serializeQgs(project, { version: "4.4" }));
  assert.equal(findChild(modern, "shortname")?.children[0]?.type, "text");
  assert.equal(
    findChildren(findChild(modern, "customproperties")!, "property").length,
    0,
  );
  assert.equal(
    parseQgs(serializeQgs(project, { version: "4.4" })).layerTree!.children[0]!
      .type,
    "group",
  );

  // 3.44 to 4.2 store a default TIME dimension as an attribute, 4.4 as an element.
  server.wmsDimensions = [{ name: "TIME", defaultDisplayType: 0 }];
  const v42 = serializeQgs(project, { version: "4.2" });
  assert.equal(groupOf(v42).attributes["wms-has-time-dimension"], "1");
  assert.equal(findChild(groupOf(v42), "wmsDimensions"), undefined);
  const reread = parseQgs(v42).layerTree!.children[0]!;
  assert.deepEqual(reread.type === "group" && reread.server, group.server);
  assert.equal(
    reread.type === "group" &&
      reread.attributes?.["wms-has-time-dimension" as never],
    undefined,
  );
  const v44 = groupOf(serializeQgs(parseQgs(v42), { version: "4.4" }));
  assert.equal(v44.attributes["wms-has-time-dimension"], undefined);
  assert.deepEqual(
    findChild(findChild(v44, "wmsDimensions")!, "dimension")!.attributes,
    { name: "TIME", defaultDisplayType: "0" },
  );

  // Settings an older target cannot store fail instead of being dropped.
  assert.throws(() => serializeQgs(project, { version: "3.40" }), {
    code: "INVALID_EDIT",
  });
  server.wmsDimensions[0]!.referenceValue = "2026-01-01T00:00:00";
  assert.throws(() => serializeQgs(project, { version: "4.2" }), {
    code: "INVALID_EDIT",
  });
  delete server.wmsDimensions;
  const v340 = serializeQgs(project, { version: "3.40" });
  const legacy = groupOf(v340);
  assert.match(
    v340,
    /<Option name="wmsShortName" type="QString" value="group_name"\/>/,
  );
  const back = parseQgs(v340).layerTree!.children[0]!;
  assert.deepEqual(back.type === "group" && back.server, server);
  assert.equal(findChild(legacy, "shortname"), undefined);
  group.customProperties = { wmsTitle: "ambiguous" };
  assert.throws(() => serializeQgs(project, { version: "4.4" }), {
    code: "INVALID_EDIT",
  });
});
