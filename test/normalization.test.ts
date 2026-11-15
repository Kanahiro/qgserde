import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQgs, QgsError, serializeQgs } from "../src/index.ts";
import { findChild, getText, readXml } from "../src/xml.ts";

test("unchanged known values are reconstructed and normalized after JSON storage", () => {
  const project = JSON.parse(
    JSON.stringify(
      parseQgs(
        '<qgis version="4.2.0" projectname="stale-name"><title>stale-title</title><projectMetadata><title>Canonical</title></projectMetadata><layer-tree-group><layer-tree-layer id="vector_layer_001"/></layer-tree-group><projectlayers><maplayer type="VECTOR" minScale="1e2" readOnly="true"><id>vector_layer_001</id><aliases><alias field="amount" plugin="keep"/></aliases></maplayer></projectlayers></qgis>',
      ),
    ),
  );
  const before = structuredClone(project);
  const output = serializeQgs(project, { version: "4.2" });
  const root = readXml(output).root;
  assert.equal(root.attributes.projectname, "Canonical");
  assert.equal(getText(findChild(root, "title")!), "Canonical");
  assert.ok(!output.includes("stale-name") && !output.includes("stale-title"));
  const layer = findChild(findChild(root, "projectlayers")!, "maplayer")!;
  assert.equal(layer.attributes.type, "vector");
  assert.equal(layer.attributes.minScale, "100");
  assert.equal(layer.attributes.readOnly, "1");
  for (const tag of ["layername", "datasource", "provider"])
    assert.equal(getText(findChild(layer, tag)!), "");
  assert.equal(
    findChild(findChild(layer, "fieldConfiguration")!, "field")!.attributes
      .name,
    "amount",
  );
  assert.deepEqual(
    findChild(findChild(layer, "aliases")!, "alias")!.attributes,
    {
      field: "amount",
      name: "",
      plugin: "keep",
    },
  );
  assert.equal(
    findChild(findChild(root, "layer-tree-group")!, "layer-tree-layer")!
      .attributes.checked,
    "Qt::Checked",
  );
  assert.deepEqual(project, before);
  assert.equal(serializeQgs(parseQgs(output), { version: "4.2" }), output);
});

test("inactive CRS and independent legacy views are modeled and editable without source layout", () => {
  const parsed = parseQgs(
    '<qgis version="4.2.0"><projectCrs><spatialrefsys><authid>EPSG:6677</authid></spatialrefsys></projectCrs><ProjectViewSettings rotation="10"><DefaultViewExtent xmin="0" ymin="0" xmax="1" ymax="1"/></ProjectViewSettings><mapcanvas><extent xmin="2" ymin="2" xmax="3" ymax="3"/><rotation>20</rotation></mapcanvas></qgis>',
  );
  assert.equal(parsed.disabledCrs?.authId, "EPSG:6677");
  assert.equal(parsed.legacyView?.rotation, 20);
  const model = JSON.parse(
    JSON.stringify(parsed, (key, value) =>
      key === "extensions" ? undefined : value,
    ),
  );
  model.legacyView.rotation = 30;
  model.legacyView.extent.xmin = -5;
  const result = parseQgs(serializeQgs(model, { version: "4.2" }));
  assert.equal(result.crs, undefined);
  assert.equal(result.disabledCrs?.srsId, 1);
  assert.equal(result.rotation, 10);
  assert.equal(result.legacyView?.rotation, 30);
  assert.equal(result.legacyView?.extent?.xmin, -5);
});

test("invalid alternate settings cannot bypass validation as untouched extension data", () => {
  for (const payload of [
    '<mapcanvas><extent ymin="2" xmax="3" ymax="4"/></mapcanvas>',
    "<mapcanvas><rotation>Infinity</rotation></mapcanvas>",
    "<mapcanvas><destinationsrs><spatialrefsys><srsid>invalid</srsid></spatialrefsys></destinationsrs></mapcanvas>",
    "<projectCrs><spatialrefsys><srsid>invalid</srsid></spatialrefsys></projectCrs>",
  ]) {
    assert.throws(
      () =>
        parseQgs(
          `<qgis version="4.2.0"><ProjectViewSettings rotation="10"><DefaultViewExtent xmin="0" ymin="0" xmax="1" ymax="1"/></ProjectViewSettings>${payload}</qgis>`,
        ),
      (error) => error instanceof QgsError && error.code === "INVALID_PROJECT",
    );
  }
});
