import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createProject, parseQgs, serializeQgs } from "../../src/index.ts";
import { createRasterProject, writeRasterData } from "./raster.ts";
import { createSettingsProject } from "./settings.ts";
import { createSymbologyProject } from "./symbology.ts";
import { createTileGallery } from "./tile-gallery.ts";

export function writeQgisFixtures(directory: string, version: string): void {
  mkdirSync(directory, { recursive: true });
  const project = createProject({ title: "検証 & 地図" });
  project.layers.push({
    id: "cities_layer_001",
    name: "都市",
    type: "vector",
    provider: "memory",
    source: "Point?crs=EPSG:4326&field=name:string",
    crs: { authId: "EPSG:4326" },
    fields: [],
  });
  project.crs = { authId: "EPSG:4326" };
  project.extent = {
    xmin: 140,
    ymin: 40,
    xmax: 145,
    ymax: 45,
    crs: { authId: "EPSG:4326" },
  };
  project.rotation = 15;
  writeFileSync(
    join(directory, "generated.qgs"),
    serializeQgs(project, { version }),
  );
  // Incomplete input must get the same authority lookup support as new models.
  const legacy = parseQgs(
    serializeQgs(project, { version: "3.8" }).replaceAll(
      "<srsid>1</srsid>",
      "",
    ),
  );
  writeFileSync(
    join(directory, "converted.qgs"),
    serializeQgs(JSON.parse(JSON.stringify(legacy)), { version }),
  );

  // Keep exercising edits to real QGIS XML as well as freshly created models.
  const edited = parseQgs(
    readFileSync(new URL("../fixtures/qgis4.qgs", import.meta.url), "utf8"),
  );
  edited.title = project.title;
  edited.layers[0]!.name = "都市";
  edited.layers[0]!.crs = project.crs;
  edited.crs = project.crs;
  edited.extent = project.extent;
  edited.rotation = project.rotation;
  writeFileSync(
    join(directory, "edited.qgs"),
    serializeQgs(edited, { version }),
  );

  const gallery = serializeQgs(createTileGallery(), { version });
  writeFileSync(join(directory, "gallery.qgs"), gallery);
  writeFileSync(
    join(directory, "gallery-roundtrip.qgs"),
    serializeQgs(parseQgs(gallery.replaceAll("<srsid>1</srsid>", "")), {
      version,
    }),
  );

  const symbology = serializeQgs(createSymbologyProject(), { version });
  writeFileSync(join(directory, "symbology.qgs"), symbology);
  writeFileSync(
    join(directory, "symbology-roundtrip.qgs"),
    serializeQgs(JSON.parse(JSON.stringify(parseQgs(symbology))), { version }),
  );

  const settings = serializeQgs(createSettingsProject(), { version });
  writeFileSync(join(directory, "settings.qgs"), settings);
  writeFileSync(
    join(directory, "settings-roundtrip.qgs"),
    serializeQgs(JSON.parse(JSON.stringify(parseQgs(settings))), { version }),
  );

  writeRasterData(directory);
  const raster = serializeQgs(createRasterProject(), { version });
  writeFileSync(join(directory, "raster.qgs"), raster);
  writeFileSync(
    join(directory, "raster-roundtrip.qgs"),
    serializeQgs(JSON.parse(JSON.stringify(parseQgs(raster))), { version }),
  );

  // A real WMS (not XYZ) exercises GetCapabilities without an external service.
  // The verifier runs in this directory so the file URL also works in Docker.
  writeFileSync(
    join(directory, "wms-capabilities.xml"),
    readFileSync(new URL("../fixtures/wms-capabilities.xml", import.meta.url)),
  );
  const wms = parseQgs(
    '<qgis version="3.44.0"><layer-tree-group><layer-tree-group name="公開 WMS"><layer-tree-layer id="states" name="OpenStreetMap" checked="Qt::Checked"/></layer-tree-group></layer-tree-group><projectlayers><maplayer type="raster"><id>states</id><layername>OpenStreetMap</layername><provider>wms</provider></maplayer></projectlayers></qgis>',
  );
  wms.layers[0]!.id = "states_wms_layer";
  wms.layers[0]!.source =
    "crs=EPSG:3857&format=image/png&layers=OSM-WMS&styles=&version=1.1.1&url=file:wms-capabilities.xml";
  wms.layers[0]!.crs = { authId: "EPSG:3857" };
  wms.crs = { authId: "EPSG:6677" };
  const wmsXml = serializeQgs(wms, { version });
  writeFileSync(join(directory, "wms.qgs"), wmsXml);
  writeFileSync(
    join(directory, "wms-roundtrip.qgs"),
    serializeQgs(
      JSON.parse(
        JSON.stringify(parseQgs(wmsXml.replaceAll("<srsid>1</srsid>", ""))),
      ),
      { version },
    ),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [directory, version] = process.argv.slice(2);
  if (!directory || !version)
    throw new Error(
      "Usage: node test/qgis/fixtures.ts <directory> <QGIS version>",
    );
  writeQgisFixtures(directory, version);
}
