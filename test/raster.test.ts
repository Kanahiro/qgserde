import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { QgsProject, QgsRasterLayer } from "../src/index.ts";
import {
  parseJson,
  parseQgs,
  serializeJson,
  serializeQgs,
} from "../src/index.ts";
import { findChild, findChildren, getText, readXml } from "../src/xml.ts";

const fixture = () =>
  parseQgs(
    readFileSync(
      new URL("./fixtures/qgis3-raster-styles.qgs", import.meta.url),
      "utf8",
    ),
  );

function raster(project: QgsProject, name: string): QgsRasterLayer {
  const layer = project.layers.find((item) => item.name === name);
  if (layer?.type !== "raster") throw new Error(`Expected raster ${name}`);
  return layer;
}

test("reads raster pipes written by QGIS", () => {
  const project = fixture();
  const gray = raster(project, "gray");
  assert.equal(gray.renderer?.type, "singlebandgray");
  assert.equal(gray.renderer?.attributes?.grayBand, "1");
  assert.deepEqual(gray.renderer?.contrastEnhancement, {
    minValue: "1",
    maxValue: "4",
    algorithm: "StretchToMinimumMaximum",
  });
  assert.equal(gray.renderer?.minMaxOrigin?.limits, "None");
  assert.equal(gray.brightnessContrast?.brightness, "10");
  assert.equal(gray.hueSaturation?.grayscaleMode, "2");
  assert.equal(gray.resamplingStage, "resamplingFilter");
  assert.equal(gray.providerResampling?.zoomedInResamplingMethod, "bilinear");
  const plain = (value: unknown) =>
    JSON.parse(
      JSON.stringify(value, (key, item) =>
        key === "extensions" ? undefined : item,
      ),
    );
  assert.deepEqual(plain(gray.noData), [
    { band: 1, useSourceNoData: true, ranges: [{ min: "1", max: "1" }] },
  ]);

  const shader = raster(project, "pseudo").renderer?.shader;
  assert.equal(shader?.attributes?.colorRampType, "INTERPOLATED");
  assert.equal(shader?.colorRamp?.properties.color2, "255,0,0,255");
  assert.deepEqual(
    shader?.items?.map((item) => item.label),
    ["low", "high"],
  );
  assert.equal(shader?.legend?.useContinuousLegend, "1");
  assert.equal(raster(project, "paletted").renderer?.palette?.length, 2);
  const rgb = raster(project, "rgb").renderer;
  assert.deepEqual(
    [rgb?.redBand, rgb?.greenBand, rgb?.blueBand, rgb?.opacity],
    [1, 2, 3, 0.7],
  );
  assert.equal(
    rgb?.transparency?.threeValuePixelList?.[0]?.percentTransparent,
    "100",
  );
  assert.equal(rgb?.blueContrastEnhancement?.maxValue, "4");
  assert.equal(
    raster(project, "hillshade").renderer?.attributes?.azimuth,
    "315",
  );
});

test("edits raster pipes and keeps unmodeled children in place", () => {
  const project = fixture();
  const pseudo = raster(project, "pseudo");
  const shader = pseudo.renderer!.shader!;
  shader.items!.splice(1, 0, {
    value: "2",
    color: "#00ff00",
    alpha: "255",
    label: "mid",
  });
  shader.attributes!.colorRampType = "DISCRETE";
  const gray = raster(project, "gray");
  delete gray.renderer!.contrastEnhancement;
  gray.renderer!.minMaxOrigin!.limits = "MinMax";
  gray.hueSaturation = { saturation: "10" };
  delete gray.noData;
  const rgb = raster(project, "rgb");
  delete rgb.renderer!.transparency;

  for (const output of [
    serializeQgs(project, { version: "3.34" }),
    serializeQgs(parseJson(serializeJson(project)), { version: "4.2" }),
  ]) {
    const reparsed = parseQgs(output);
    assert.deepEqual(
      raster(reparsed, "pseudo").renderer?.shader?.items?.map((i) => i.label),
      ["low", "mid", "high"],
    );
    const layer = findChildren(
      findChild(readXml(output).root, "projectlayers")!,
      "maplayer",
    ).find((item) => getText(findChild(item, "layername")!) === "gray")!;
    assert.equal(findChild(layer, "noData"), undefined);
    const renderer = findChild(findChild(layer, "pipe")!, "rasterrenderer")!;
    assert.equal(renderer.attributes.type, "singlebandgray");
    assert.equal(findChild(renderer, "contrastEnhancement"), undefined);
    // The legend's nested numeric format stays with its element.
    assert.ok(
      findChild(findChild(renderer, "rampLegendSettings")!, "numericFormat"),
    );
    assert.deepEqual(
      findChild(findChild(layer, "pipe")!, "huesaturation")!.attributes,
      { saturation: "10" },
    );
    const gray2 = raster(reparsed, "gray");
    assert.equal(gray2.renderer?.minMaxOrigin?.limits, "MinMax");
    assert.equal(gray2.noData, undefined);
    assert.equal(raster(reparsed, "rgb").renderer?.transparency, undefined);
    assert.equal(
      raster(reparsed, "pseudo").renderer?.shader?.attributes?.colorRampType,
      "DISCRETE",
    );
  }
});
