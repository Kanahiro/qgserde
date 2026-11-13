import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTileGallery } from "../../examples/create-tile-gallery.ts";
import { createProject, parseQgs, serializeQgs } from "../../src/index.ts";

export function writeQgisFixtures(directory: string, version: string): void {
  mkdirSync(directory, { recursive: true });
  const templateXml = readFileSync(
    new URL("../../examples/template.qgs", import.meta.url),
    "utf8",
  );
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
  const legacy = parseQgs(serializeQgs(project, { version: "3.8" }));
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

  const gallery = serializeQgs(createTileGallery(templateXml), { version });
  writeFileSync(join(directory, "gallery.qgs"), gallery);
  writeFileSync(
    join(directory, "gallery-roundtrip.qgs"),
    serializeQgs(parseQgs(gallery), { version }),
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
