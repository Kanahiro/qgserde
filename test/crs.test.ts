import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQgs, serializeQgs } from "../src/index.ts";
import { readXml } from "../src/xml.ts";

for (const version of ["3.8", "3.44", "4.2"]) {
  test(`repairs authority-only CRS across project, layers and view for QGIS ${version}`, () => {
    const crs =
      '<spatialrefsys plugin="keep"><authid>EPSG:6677</authid><!--keep--><custom/></spatialrefsys>';
    const xml = `<qgis version="4.2.0"><properties><SpatialRefSys><ProjectionsEnabled>1</ProjectionsEnabled></SpatialRefSys></properties><projectCrs>${crs}</projectCrs><verticalCrs>${crs}</verticalCrs><ProjectViewSettings><DefaultViewExtent xmin="0" ymin="0" xmax="1" ymax="1">${crs}</DefaultViewExtent></ProjectViewSettings><projectlayers><maplayer type="raster"><id>wms_layer_001</id><provider>wms</provider><srs>${crs}</srs></maplayer><maplayer type="vector-tile"><id>tiles_layer_001</id><provider>xyzvectortiles</provider><srs>${crs}</srs></maplayer></projectlayers></qgis>`;
    const project = JSON.parse(JSON.stringify(parseQgs(xml)));
    const before = structuredClone(project);
    const output = serializeQgs(project, { version });
    const repaired = parseQgs(output);
    for (const definition of [
      repaired.crs,
      repaired.verticalCrs,
      repaired.extent?.crs,
      ...repaired.layers.map((layer) => layer.crs),
    ]) {
      assert.equal(definition?.authId, "EPSG:6677");
      assert.equal(definition?.srsId, 1);
    }
    assert.equal((output.match(/<!--keep--><custom\/>/gu) ?? []).length, 5);
    assert.equal((output.match(/plugin="keep"/gu) ?? []).length, 5);
    assert.deepEqual(project, before);
    assert.deepEqual(
      readXml(serializeQgs(repaired, { version })),
      readXml(output),
    );
  });
}
