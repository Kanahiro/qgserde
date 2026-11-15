import assert from "node:assert/strict";
import { test } from "node:test";
import { QgsError } from "./errors.ts";
import { ExtensionCodec } from "./extensions.ts";
import { readLayer, readLayerId, writeLayer } from "./layer-codec.ts";
import type { QgsMapLayer, QgsVectorLayer } from "./types.ts";
import { createElement, findChild, findChildren, readXml } from "./xml.ts";

const vector: QgsVectorLayer = {
  type: "vector",
  id: "vector_layer_001",
  name: "都市",
  source: "Point?crs=EPSG:4326",
  provider: "memory",
  fields: [],
};

test("layer IDs prefer child text, with attribute and empty fallbacks", () => {
  assert.equal(
    readLayerId(
      readXml('<maplayer id="attribute"><id>child</id></maplayer>').root,
    ),
    "child",
  );
  assert.equal(
    readLayerId(readXml('<maplayer id="attribute"/>').root),
    "attribute",
  );
  assert.equal(
    readLayerId(readXml('<maplayer id="attribute"><id/></maplayer>').root),
    "",
  );
  assert.equal(readLayerId(createElement("maplayer")), "");
});

for (const [xmlType, type] of [
  ["VECTOR", "vector"],
  ["raster", "raster"],
  ["pointcloud", "point-cloud"],
  ["point-cloud", "point-cloud"],
  ["mesh", "mesh"],
  ["vector-tile", "vector-tile"],
  ["plugin", "plugin"],
  ["annotation", "annotation"],
  ["group", "group"],
  ["tiled-scene", "tiled-scene"],
  ["FutureLayer", "unknown"],
  ["", "unknown"],
] as const) {
  test(`decodes layer type ${JSON.stringify(xmlType)}`, () => {
    const codec = new ExtensionCodec();
    const element = createElement("maplayer", { type: xmlType, id: "id" });
    const layer = readLayer(element, codec);
    assert.equal(layer.type, type);
    assert.equal(codec.source(layer), element);
    if (layer.type === "unknown") assert.equal(layer.xmlType, xmlType);
    if (layer.type === "vector") assert.deepEqual(layer.fields, []);
  });
}

test("decodes all common layer scalars without treating empty strings as missing", () => {
  const element = readXml(
    '<maplayer type="vector" minScale="1e2" maxScale="200" hasScaleBasedVisibilityFlag="0" geometry="Point" wkbType="1" readOnly="1" labelsEnabled="false"><id>vector_layer_001</id><layername/><datasource>./cities.gpkg</datasource><provider encoding="UTF-8">ogr</provider><layerOpacity>0</layerOpacity><srs><spatialrefsys><wkt>opaque WKT</wkt></spatialrefsys></srs><extent xmin="1" ymin="2" xmax="3" ymax="4"/></maplayer>',
  ).root;
  assert.deepEqual(readLayer(element, new ExtensionCodec()), {
    type: "vector",
    id: "vector_layer_001",
    name: "",
    source: "./cities.gpkg",
    provider: "ogr",
    providerEncoding: "UTF-8",
    minScale: 100,
    maxScale: 200,
    scaleBasedVisibility: false,
    opacity: 0,
    geometry: "Point",
    wkbType: "1",
    readOnly: true,
    labelsEnabled: false,
    crs: { wkt: "opaque WKT" },
    extent: { xmin: 1, ymin: 2, xmax: 3, ymax: 4 },
    fields: [],
  });
});

test("decodes vector field settings and renderer scalars", () => {
  const element = readXml(
    '<maplayer type="vector"><id>vector_layer_001</id><fieldConfiguration><field name="a"><editWidget type="Range"/></field></fieldConfiguration><aliases><alias field="a" name="Amount"/></aliases><defaults><default field="a" expression="001" applyOnUpdate="0"/></defaults><renderer-v2 type="categorizedSymbol" attr="a" symbollevels="true" forceraster="0" referencescale="1000"/></maplayer>',
  ).root;
  const layer = readLayer(element, new ExtensionCodec());
  assert.equal(layer.type, "vector");
  if (layer.type !== "vector") throw new Error("Expected vector");
  assert.deepEqual(layer.fields, [
    {
      name: "a",
      editorWidgetType: "Range",
      alias: "Amount",
      defaultExpression: "001",
      applyDefaultOnUpdate: false,
    },
  ]);
  assert.deepEqual(layer.renderer, {
    type: "categorizedSymbol",
    attribute: "a",
    symbolLevels: true,
    forceRaster: false,
    referenceScale: 1000,
  });
});

test("writes plain vector fields and renderers without mutating the model", () => {
  const layer: QgsVectorLayer = {
    ...vector,
    fields: [
      {
        name: "a",
        alias: "Amount",
        defaultExpression: "1",
        applyDefaultOnUpdate: false,
        editorWidgetType: "Range",
      },
    ],
    renderer: {
      type: "singleSymbol",
      symbolLevels: false,
      forceRaster: true,
      referenceScale: 0,
    },
  };
  const before = structuredClone(layer);
  const element = writeLayer(layer, new ExtensionCodec());
  assert.deepEqual(findChild(element, "renderer-v2")!.attributes, {
    type: "singleSymbol",
    symbollevels: "0",
    forceraster: "1",
    referencescale: "0",
  });
  assert.deepEqual(
    findChild(findChild(element, "defaults")!, "default")!.attributes,
    { field: "a", expression: "1", applyOnUpdate: "0" },
  );
  assert.deepEqual(layer, before);
});

test("removes vector renderers, fields and common scalars while preserving unrelated XML", () => {
  const source = readXml(
    '<maplayer type="vector" plugin="keep" minScale="100"><id>vector_layer_001</id><provider encoding="UTF-8">ogr</provider><layerOpacity>0.5</layerOpacity><fieldConfiguration><!--keep--><field name="a"/></fieldConfiguration><aliases><alias field="a" name="A"/><alias field="external" name="Keep"/></aliases><defaults><default field="a" expression="1"/></defaults><renderer-v2 type="singleSymbol"/><custom/></maplayer>',
  ).root;
  const codec = new ExtensionCodec();
  const layer = readLayer(source, codec);
  if (layer.type !== "vector") throw new Error("Expected vector");
  layer.fields = [];
  delete layer.renderer;
  delete layer.opacity;
  delete layer.minScale;
  delete layer.providerEncoding;
  const before = structuredClone(source);
  const output = writeLayer(layer, codec);
  assert.equal(findChild(output, "renderer-v2"), undefined);
  assert.equal(findChild(output, "layerOpacity"), undefined);
  assert.equal(output.attributes.minScale, undefined);
  assert.equal(findChild(output, "provider")!.attributes.encoding, undefined);
  assert.deepEqual(findChild(output, "fieldConfiguration")!.children, [
    { type: "comment", value: "keep" },
  ]);
  assert.deepEqual(
    findChildren(findChild(output, "aliases")!, "alias").map(
      (node) => node.attributes.field,
    ),
    [],
  );
  assert.equal(
    findChildren(findChild(output, "defaults")!, "default").length,
    0,
  );
  assert.ok(findChild(output, "custom"));
  assert.deepEqual(source, before);
});

test("raster renderer removal retains other pipe stages", () => {
  const source = readXml(
    '<maplayer type="raster"><id>raster_layer_001</id><pipe><brightnesscontrast value="keep"/><rasterrenderer type="multibandcolor" opacity="0" alphaBand="-1" band="1" redBand="1" greenBand="2" blueBand="3"/></pipe></maplayer>',
  ).root;
  const codec = new ExtensionCodec();
  const layer = readLayer(source, codec);
  if (layer.type !== "raster") throw new Error("Expected raster");
  assert.deepEqual(layer.renderer, {
    type: "multibandcolor",
    opacity: 0,
    alphaBand: -1,
    band: 1,
    redBand: 1,
    greenBand: 2,
    blueBand: 3,
  });
  delete layer.renderer;
  const pipe = findChild(writeLayer(layer, codec), "pipe")!;
  assert.deepEqual(pipe.children, [
    createElement("brightnesscontrast", { value: "keep" }),
  ]);
});

test("rejects blank layer IDs and duplicate fields including inferred legacy fields", () => {
  for (const id of ["", " \t\n"])
    assert.throws(
      () => writeLayer({ ...vector, id }, new ExtensionCodec()),
      (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
    );
  assert.throws(
    () =>
      writeLayer(
        { ...vector, fields: [{ name: "a" }, { name: "a" }] },
        new ExtensionCodec(),
      ),
    /Duplicate field/u,
  );
  const source = readXml(
    '<maplayer type="vector"><id>vector_layer_001</id><defaults><default field="external" expression="keep"/></defaults></maplayer>',
  ).root;
  const codec = new ExtensionCodec();
  const layer = readLayer(source, codec);
  if (layer.type !== "vector") throw new Error("Expected vector");
  layer.fields.push({ name: "external" });
  assert.throws(() => writeLayer(layer, codec), /Duplicate field/u);
});

test("new and renamed layer IDs must survive QGIS loading", () => {
  for (const type of ["vector", "raster", "vector-tile"] as const) {
    for (const id of ["states", "1234567890"])
      assert.throws(
        () => writeLayer({ ...vector, type, id }, new ExtensionCodec()),
        (error) =>
          error instanceof QgsError &&
          error.code === "INVALID_EDIT" &&
          error.message.includes("at least 11"),
      );
    assert.equal(
      readLayerId(
        writeLayer(
          { ...vector, type, id: "12345678901" },
          new ExtensionCodec(),
        ),
      ),
      "12345678901",
    );
  }
  const codec = new ExtensionCodec();
  const source = readXml(
    '<maplayer type="raster"><id>states_wms_layer</id></maplayer>',
  ).root;
  const layer = readLayer(source, codec);
  layer.id = "states";
  assert.throws(() => writeLayer(layer, codec), /at least 11/u);
  assert.equal(readLayerId(source), "states_wms_layer");
});

test("fresh vector tiles get complete native styles while existing renderers stay intact", () => {
  const layer: QgsMapLayer = {
    type: "vector-tile",
    id: "vector_tiles_001",
    name: "Tiles",
    provider: "xyzvectortiles",
    source: "type=xyz&url=https://example.com/{z}/{x}/{y}.pbf",
  };
  const element = writeLayer(layer, new ExtensionCodec());
  const renderer = findChild(element, "renderer")!;
  assert.equal(renderer.attributes.type, "basic");
  const styles = findChildren(findChild(renderer, "styles")!, "style");
  assert.deepEqual(
    styles.map((style) => [
      style.attributes.geometry,
      style.attributes["min-zoom"],
      style.attributes["max-zoom"],
    ]),
    [
      ["2", "-1", "-1"],
      ["1", "-1", "-1"],
      ["0", "-1", "-1"],
    ],
  );
  assert.deepEqual(
    styles.map(
      (style) =>
        findChild(findChild(findChild(style, "symbols")!, "symbol")!, "layer")!
          .attributes.class,
    ),
    ["SimpleFill", "SimpleLine", "SimpleMarker"],
  );
  const source = readXml(
    '<maplayer type="vector-tile"><id>tiles_layer_001</id><renderer type="custom"><plugin/></renderer></maplayer>',
  ).root;
  const codec = new ExtensionCodec();
  const parsed = readLayer(source, codec);
  assert.deepEqual(
    findChild(writeLayer(parsed, codec), "renderer"),
    findChild(source, "renderer"),
  );
});
