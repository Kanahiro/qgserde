import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  addLayer,
  createLayer,
  createProject,
  findChild,
  getText,
  parseQgs,
  serializeQgs,
  setProjectTitle,
  updateLayer,
} from "../src/index.ts";

// Run with QGIS_PYTHON pointing at a Python executable with PyQGIS installed.
const qgisPython = process.env.QGIS_PYTHON;
test("QGIS opens generated QGIS 3/4 projects and edited real QGIS 4 XML", {
  skip: !qgisPython,
}, () => {
  assert.ok(qgisPython);
  const directory = mkdtempSync(join(tmpdir(), "qgserde-"));
  try {
    const paths: string[] = [];
    for (const version of ["3.40", "4.2"]) {
      const project = createProject(version, "検証 & 地図");
      addLayer(
        project,
        createLayer({
          id: "cities_001",
          name: "都市",
          type: "vector",
          provider: "memory",
          source: "Point?crs=EPSG:4326&field=name:string",
          crs: "EPSG:4326",
        }),
      );
      const path = join(directory, `generated-${version}.qgs`);
      writeFileSync(path, serializeQgs(project));
      paths.push(path);
    }
    const project = parseQgs(
      readFileSync(new URL("./fixtures/qgis4.qgs", import.meta.url), "utf8"),
    );
    setProjectTitle(project, "検証 & 地図");
    const layer = findChild(
      findChild(project.root, "projectlayers")!,
      "maplayer",
    )!;
    updateLayer(project, getText(findChild(layer, "id")!), { name: "都市" });
    const editedPath = join(directory, "edited.qgs");
    writeFileSync(editedPath, serializeQgs(project));
    paths.push(editedPath);
    const output = execFileSync(
      qgisPython,
      [
        "-c",
        `
import sys
from qgis.core import QgsApplication, QgsProject
app = QgsApplication([], False)
app.initQgis()
for path in sys.argv[1:]:
    project = QgsProject()
    assert project.read(path), path
    assert project.title() == '検証 & 地図', (path, project.title())
    layers = list(project.mapLayers().values())
    assert len(layers) == 1, (path, len(layers))
    assert layers[0].isValid(), (path, 'invalid layer')
    assert layers[0].name() == '都市', (path, layers[0].name())
    assert layers[0].crs().authid() == 'EPSG:4326', path
    assert len(project.layerTreeRoot().findLayers()) == 1, path
print('QGIS verified 3 projects')
`,
        ...paths,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, QT_QPA_PLATFORM: "offscreen" },
        timeout: 60_000,
      },
    );
    assert.match(output, /QGIS verified 3 projects/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
