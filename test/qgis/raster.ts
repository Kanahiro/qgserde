import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { QgsProject, QgsRasterLayer } from "../../src/index.ts";
import { createProject } from "../../src/index.ts";

/** Write the small rasters the raster project reads: a 2x2 grid and a 3-band VRT of it. */
export function writeRasterData(directory: string): void {
  writeFileSync(
    join(directory, "dem.asc"),
    "ncols 2\nnrows 2\nxllcorner 140\nyllcorner 40\ncellsize 1\nNODATA_value -9999\n1 2\n3 4\n",
  );
  const band = (index: number) =>
    `<VRTRasterBand dataType="Float32" band="${index}"><SimpleSource><SourceFilename relativeToVRT="1">dem.asc</SourceFilename><SourceBand>1</SourceBand></SimpleSource></VRTRasterBand>`;
  writeFileSync(
    join(directory, "rgb.vrt"),
    `<VRTDataset rasterXSize="2" rasterYSize="2"><SRS>EPSG:4326</SRS><GeoTransform>140, 1, 0, 42, 0, -1</GeoTransform>${[1, 2, 3].map(band).join("")}</VRTDataset>`,
  );
}

const ramp = {
  type: "gradient",
  properties: { color1: "0,0,255,255", color2: "255,0,0,255" },
};

/** Raster layers covering every modeled pipe setting. */
export function createRasterProject(): QgsProject {
  const project = createProject({ title: "Raster" });
  project.crs = { authId: "EPSG:4326" };
  const base = (id: string, name: string, source = "./dem.asc") =>
    ({
      type: "raster",
      id,
      name,
      source,
      provider: "gdal",
      crs: { authId: "EPSG:4326" },
    }) satisfies QgsRasterLayer;
  project.layers.push(
    {
      ...base("gray_raster_0001", "gray"),
      renderer: {
        type: "singlebandgray",
        attributes: { grayBand: 1, gradient: "WhiteToBlack" },
        contrastEnhancement: {
          minValue: "1",
          maxValue: "4",
          algorithm: "StretchToMinimumMaximum",
        },
      },
      brightnessContrast: { brightness: 10, contrast: 20, gamma: 1.5 },
      hueSaturation: { saturation: -50, grayscaleMode: 2 },
      providerResampling: {
        enabled: true,
        zoomedInResamplingMethod: "bilinear",
      },
      noData: [
        { band: 1, useSourceNoData: false, ranges: [{ min: 1, max: 1 }] },
      ],
    },
    {
      ...base("pseudo_raster_001", "pseudo"),
      renderer: {
        type: "singlebandpseudocolor",
        band: 1,
        attributes: { classificationMin: 1, classificationMax: 4 },
        shader: {
          attributes: {
            colorRampType: "DISCRETE",
            minimumValue: 1,
            maximumValue: 4,
          },
          colorRamp: ramp,
          items: [
            { value: 2, color: "#0000ff", alpha: 255, label: "low" },
            { value: 4, color: "#ff0000", alpha: 128, label: "high" },
          ],
        },
      },
    },
    {
      ...base("paletted_raster_1", "paletted"),
      renderer: {
        type: "paletted",
        band: 1,
        palette: [
          { value: 1, color: "#0a141e", alpha: 255, label: "one" },
          { value: 2, color: "#28323c", alpha: 255, label: "two" },
        ],
        colorRamp: ramp,
      },
    },
    {
      ...base("rgb_raster_00001", "rgb", "./rgb.vrt"),
      renderer: {
        type: "multibandcolor",
        opacity: 0.7,
        redBand: 3,
        greenBand: 2,
        blueBand: 1,
        transparency: {
          threeValuePixelList: [
            { red: 1, green: 1, blue: 1, percentTransparent: 100 },
          ],
        },
        redContrastEnhancement: {
          minValue: "1",
          maxValue: "4",
          algorithm: "StretchToMinimumMaximum",
        },
      },
    },
    {
      ...base("hillshade_raster", "hillshade"),
      renderer: {
        type: "hillshade",
        band: 1,
        attributes: { azimuth: 300, angle: 40, zfactor: 2 },
      },
    },
  );
  return project;
}
