import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createProject,
  parseQgisVersion,
  parseQgs,
  QgsError,
  serializeQgs,
} from "../src/index.ts";
import { findChild, getText, readXml } from "../src/xml.ts";

test("deserializes a domain model instead of an arbitrary XML root", () => {
  const project = parseQgs(
    '<qgis version="4.2" projectname="old"><title>legacy</title><projectMetadata><title>metadata</title><author>keep</author></projectMetadata></qgis>',
  );
  assert.equal(project.version, "4.2");
  assert.equal(project.title, "metadata");
  assert.equal(project.metadata.author, "keep");
  assert.deepEqual(project.layers, []);
  assert.equal("root" in project, false);
  project.title = "新しい地図";
  project.metadata.author = "edited";
  const root = readXml(serializeQgs(project)).root;
  assert.equal(getText(findChild(root, "title")!), "新しい地図");
  assert.equal(
    getText(findChild(findChild(root, "projectMetadata")!, "title")!),
    "新しい地図",
  );
  assert.equal(root.attributes.projectname, "新しい地図");
  assert.equal(parseQgs(serializeQgs(project)).metadata.author, "edited");
  project.title = "";
  assert.equal(parseQgs(serializeQgs(project)).title, "");
});

test("creates typed QGIS 3 and 4 projects and normalizes versions", () => {
  for (const version of [
    "3.28",
    "3.34.15-Prizren",
    "3.40",
    "3.44",
    "4.0",
    "4.2.0-Belém do Pará",
  ]) {
    const project = createProject(version, "札幌 & 地図");
    const output = parseQgs(serializeQgs(project));
    assert.equal(output.title, "札幌 & 地図");
    assert.equal(output.version, project.version);
    assert.deepEqual(output.layers, []);
  }
  for (const version of [
    "2.18",
    "5.0",
    "",
    "v3.40",
    "3",
    "3.40.x",
    "3.40.0.1",
    "03.40",
    "3.40-",
    "3.40.0 ",
    "999999999999999999999.0",
  ]) {
    assert.throws(
      () => createProject(version),
      (error) => error instanceof QgsError && error.code === "INVALID_VERSION",
    );
  }
  assert.deepEqual(parseQgisVersion("4.2.0-Belém do Pará"), {
    major: 4,
    minor: 2,
    patch: 0,
    suffix: "Belém do Pará",
  });
});

test("requires a qgis root and a valid source version", () => {
  for (const xml of ['<other version="3.40"/>', "<qgis/>"])
    assert.throws(
      () => parseQgs(xml),
      (error) => error instanceof QgsError && error.code === "INVALID_PROJECT",
    );
  assert.throws(
    () => parseQgs('<qgis version="unknown"/>'),
    (error) => error instanceof QgsError && error.code === "INVALID_VERSION",
  );
});

test("requires a migration for numeric version changes and preserves caller state", () => {
  const project = createProject("3.40.0-Bratislava", "original");
  for (const version of ["3.28", "3.44", "3.40.1", "4.2"])
    assert.throws(
      () => serializeQgs(project, { version }),
      (error) =>
        error instanceof QgsError && error.code === "MIGRATION_REQUIRED",
    );
  assert.equal(
    parseQgs(serializeQgs(project, { version: "3.40" })).version,
    "3.40.0",
  );
  const before = JSON.stringify(project);
  const migrated = parseQgs(
    serializeQgs(project, {
      version: "4.2",
      migrate(copy, versions) {
        assert.deepEqual(versions, { from: "3.40.0-Bratislava", to: "4.2.0" });
        copy.title = "migrated";
      },
    }),
  );
  assert.equal(migrated.title, "migrated");
  assert.equal(migrated.version, "4.2.0");
  assert.equal(JSON.stringify(project), before);
  const preserved = parseQgs(
    serializeQgs(project, { version: "4.2", versionPolicy: "preserve" }),
  );
  assert.equal(preserved.title, "original");
  assert.equal(preserved.version, "4.2.0");
  assert.throws(
    () =>
      serializeQgs(project, {
        version: "4.2",
        migrate(copy) {
          copy.title = "failed";
          throw new Error("cannot migrate");
        },
      }),
    /cannot migrate/u,
  );
  assert.equal(JSON.stringify(project), before);
});

test("reads and edits typed CRS, extents, rotation and metadata", () => {
  const project = parseQgs(
    '<qgis version="4.2"><properties><SpatialRefSys><ProjectionsEnabled type="int">1</ProjectionsEnabled></SpatialRefSys></properties><projectCrs><spatialrefsys><authid>EPSG:4326</authid><geographicflag>true</geographicflag></spatialrefsys></projectCrs><ProjectViewSettings rotation="1e1"><DefaultViewExtent xmin="0" ymin="1" xmax="2" ymax="3"/></ProjectViewSettings></qgis>',
  );
  assert.deepEqual(project.crs, { authId: "EPSG:4326", geographic: true });
  assert.deepEqual(project.extent, { xmin: 0, ymin: 1, xmax: 2, ymax: 3 });
  assert.equal(project.rotation, 10);
  project.crs = { authId: "EPSG:3857" };
  project.extent = {
    xmin: -100,
    ymin: -50,
    xmax: 100,
    ymax: 50,
    crs: { authId: "EPSG:3857" },
  };
  project.rotation = 45;
  project.homePath = "/maps";
  project.metadata.author = "author";
  const updated = parseQgs(serializeQgs(project));
  assert.equal(updated.crs!.authId, project.crs.authId);
  assert.equal(updated.extent!.xmin, project.extent.xmin);
  assert.equal(updated.extent!.xmax, project.extent.xmax);
  assert.equal(updated.extent!.crs!.authId, project.extent.crs!.authId);
  assert.equal(updated.rotation, 45);
  assert.equal(updated.homePath, "/maps");
  assert.equal(updated.metadata.author, "author");
  delete project.extent;
  delete project.crs;
  const removed = parseQgs(serializeQgs(project));
  assert.equal(removed.extent, undefined);
  assert.equal(removed.crs, undefined);
});

test("rejects invalid typed values before returning XML", () => {
  const project = createProject("4.2");
  project.rotation = Number.NaN;
  assert.throws(
    () => serializeQgs(project),
    (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
  );
  assert.throws(
    () =>
      parseQgs(
        '<qgis version="4.2"><ProjectViewSettings rotation="invalid"/></qgis>',
      ),
    (error) => error instanceof QgsError && error.code === "INVALID_PROJECT",
  );
});

test("unchanged authority-only and disabled CRS payloads retain their original XML", () => {
  for (const enabled of ["0", "1"]) {
    const xml = `<qgis version="4.2"><projectCrs><spatialrefsys><authid>EPSG:4326</authid></spatialrefsys></projectCrs><properties><SpatialRefSys><ProjectionsEnabled type="int">${enabled}</ProjectionsEnabled></SpatialRefSys></properties></qgis>`;
    const project = parseQgs(xml);
    assert.equal(
      project.crs?.authId,
      enabled === "1" ? "EPSG:4326" : undefined,
    );
    assert.deepEqual(readXml(serializeQgs(project)), readXml(xml));
  }
});

for (const fixture of ["qgis3", "qgis4"]) {
  test(`preserves all XML in an unmodified typed ${fixture} model, including after JSON storage`, () => {
    const xml = readFileSync(
      new URL(`./fixtures/${fixture}.qgs`, import.meta.url),
      "utf8",
    );
    const project = parseQgs(xml);
    assert.deepEqual(readXml(serializeQgs(project)), readXml(xml));
    assert.deepEqual(
      readXml(serializeQgs(JSON.parse(JSON.stringify(project)))),
      readXml(xml),
    );
    const before = JSON.stringify(project);
    project.title = "edited";
    const edited = serializeQgs(project);
    assert.equal(parseQgs(edited).title, "edited");
    // Snapshot is not updated when the typed model is serialized.
    assert.deepEqual(project.preservedXml, JSON.parse(before).preservedXml);
  });
}
