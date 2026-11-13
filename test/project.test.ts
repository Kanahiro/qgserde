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
    '<qgis version="4.2.0" projectname="old"><title>legacy</title><projectMetadata><title>metadata</title><author>keep</author></projectMetadata></qgis>',
  );
  assert.equal("version" in project, false);
  assert.equal(project.title, "metadata");
  assert.equal(project.metadata.author, "keep");
  assert.deepEqual(project.layers, []);
  assert.equal("root" in project, false);
  project.title = "新しい地図";
  project.metadata.author = "edited";
  const root = readXml(serializeQgs(project, { version: "4.2" })).root;
  assert.equal(getText(findChild(root, "title")!), "新しい地図");
  assert.equal(
    getText(findChild(findChild(root, "projectMetadata")!, "title")!),
    "新しい地図",
  );
  assert.equal(root.attributes.projectname, "新しい地図");
  assert.equal(
    parseQgs(serializeQgs(project, { version: "4.2" })).metadata.author,
    "edited",
  );
  project.title = "";
  assert.equal(parseQgs(serializeQgs(project, { version: "4.2" })).title, "");
});

test("creates one version-independent model and writes QGIS 3/4 formats", () => {
  const project = createProject("札幌 & 地図");
  assert.equal("version" in project, false);
  assert.equal(createProject().title, "");
  const before = JSON.stringify(project);
  for (const [version, normalized] of [
    ["3.28", "3.28.0"],
    ["3.34.15-Prizren", "3.34.15-Prizren"],
    ["3.40", "3.40.0"],
    ["3.40.1", "3.40.1"],
    ["3.44", "3.44.0"],
    ["4.0", "4.0.0"],
    ["4.2.0-Belém do Pará", "4.2.0-Belém do Pará"],
  ] as const) {
    const xml = serializeQgs(project, { version });
    assert.equal(readXml(xml).root.attributes.version, normalized);
    const output = parseQgs(xml);
    assert.equal(output.title, project.title);
    assert.equal("version" in output, false);
    assert.deepEqual(output.layers, []);
  }
  assert.equal(JSON.stringify(project), before);
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
      () => serializeQgs(project, { version }),
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

test("chooses extent and rotation storage independently for the target version", () => {
  for (const [version, extentTag, rotationTag] of [
    ["3.8", "mapcanvas", "mapcanvas"],
    ["3.10.0", "mapcanvas", "mapcanvas"],
    ["3.10.1", "ProjectViewSettings", "mapcanvas"],
    ["3.26", "ProjectViewSettings", "mapcanvas"],
    ["3.28", "ProjectViewSettings", "ProjectViewSettings"],
    ["4.2", "ProjectViewSettings", "ProjectViewSettings"],
  ] as const) {
    for (const setting of ["extent", "rotation", "both"]) {
      const project = createProject();
      project.crs = { authId: "EPSG:4326" };
      if (setting !== "rotation")
        project.extent = { xmin: 1, ymin: 2, xmax: 3, ymax: 4 };
      if (setting !== "extent") project.rotation = 15;
      const xml = serializeQgs(project, { version });
      const root = readXml(xml).root;
      if (project.extent) {
        const parent = findChild(root, extentTag)!;
        assert.ok(
          findChild(
            parent,
            extentTag === "mapcanvas" ? "extent" : "DefaultViewExtent",
          ),
        );
        assert.deepEqual(parseQgs(xml).extent, {
          ...project.extent,
          crs: { authId: "EPSG:4326", srsId: 1 },
        });
      }
      if (project.rotation !== undefined) {
        const parent = findChild(root, rotationTag)!;
        assert.equal(
          rotationTag === "mapcanvas"
            ? getText(findChild(parent, "rotation")!)
            : parent.attributes.rotation,
          "15",
        );
        assert.equal(parseQgs(xml).rotation, 15);
      }
    }
  }
});

test("reuses parsed and JSON-restored models across old and new formats without mutating them", () => {
  const original = createProject("independent");
  original.crs = { authId: "EPSG:4326" };
  original.extent = {
    xmin: 1,
    ymin: 2,
    xmax: 3,
    ymax: 4,
    crs: { authId: "EPSG:3857" },
  };
  original.rotation = 15;
  for (const source of ["3.8", "3.10.1", "3.26", "3.28", "3.44", "4.2"]) {
    const xml = serializeQgs(original, { version: source }).replace(
      "</qgis>",
      '<plugin-data value="keep"><![CDATA[unknown]]></plugin-data></qgis>',
    );
    for (const project of [
      parseQgs(xml),
      JSON.parse(JSON.stringify(parseQgs(xml))),
    ]) {
      project.extent.xmin = -10;
      project.rotation = 45;
      const before = JSON.stringify(project);
      for (const version of ["4.2", "3.8", "3.26", "4.0", "3.44"]) {
        const output = serializeQgs(project, { version });
        const root = readXml(output).root;
        const result = parseQgs(output);
        assert.equal(result.title, "independent");
        assert.equal(result.rotation, 45);
        assert.deepEqual(result.extent, project.extent);
        assert.deepEqual(result.crs, project.crs);
        assert.match(
          output,
          /<plugin-data value="keep"><!\[CDATA\[unknown\]\]><\/plugin-data>/u,
        );
        const parent = findChild(
          root,
          version === "3.8" ? "mapcanvas" : "ProjectViewSettings",
        )!;
        assert.ok(
          findChild(parent, version === "3.8" ? "extent" : "DefaultViewExtent"),
        );
        if (version === "3.8" || version === "3.26")
          assert.equal(
            getText(findChild(findChild(root, "mapcanvas")!, "rotation")!),
            "45",
          );
        else assert.equal(parent.attributes.rotation, "45");
        assert.equal(JSON.stringify(project), before);
      }
      delete project.extent;
      delete project.rotation;
      const removed = parseQgs(serializeQgs(project, { version: "3.8" }));
      assert.equal(removed.extent, undefined);
      assert.equal(removed.rotation, undefined);
    }
  }
});

test("a legacy extent keeps its own CRS when modern view settings contain other data", () => {
  const project = parseQgs(
    '<qgis version="3.26"><ProjectViewSettings><Scales/></ProjectViewSettings><mapcanvas><extent><xmin>1</xmin><ymin>2</ymin><xmax>3</xmax><ymax>4</ymax></extent><destinationsrs><spatialrefsys><authid>EPSG:3857</authid></spatialrefsys></destinationsrs></mapcanvas></qgis>',
  );
  assert.equal(project.extent?.crs?.authId, "EPSG:3857");
  assert.equal(
    parseQgs(serializeQgs(project, { version: "4.2" })).extent?.crs?.authId,
    "EPSG:3857",
  );
});

test("failed writes preserve the model and report missing target versions", () => {
  const project = createProject();
  const before = JSON.stringify(project);
  assert.throws(
    () => Reflect.apply(serializeQgs, undefined, [project]),
    (error) => error instanceof QgsError && error.code === "INVALID_VERSION",
  );
  project.rotation = Number.NaN;
  assert.throws(() => serializeQgs(project, { version: "3.8" }), /finite/u);
  delete project.rotation;
  assert.equal(JSON.stringify(project), before);
});

test("reads and edits typed CRS, extents, rotation and metadata", () => {
  const project = parseQgs(
    '<qgis version="4.2.0"><properties><SpatialRefSys><ProjectionsEnabled type="int">1</ProjectionsEnabled></SpatialRefSys></properties><projectCrs><spatialrefsys><authid>EPSG:4326</authid><geographicflag>true</geographicflag></spatialrefsys></projectCrs><ProjectViewSettings rotation="1e1"><DefaultViewExtent xmin="0" ymin="1" xmax="2" ymax="3"/></ProjectViewSettings></qgis>',
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
  const updated = parseQgs(serializeQgs(project, { version: "4.2" }));
  assert.equal(updated.crs!.authId, project.crs.authId);
  assert.equal(updated.extent!.xmin, project.extent.xmin);
  assert.equal(updated.extent!.xmax, project.extent.xmax);
  assert.equal(updated.extent!.crs!.authId, project.extent.crs!.authId);
  assert.equal(updated.rotation, 45);
  assert.equal(updated.homePath, "/maps");
  assert.equal(updated.metadata.author, "author");
  delete project.extent;
  delete project.crs;
  const removed = parseQgs(serializeQgs(project, { version: "4.2" }));
  assert.equal(removed.extent, undefined);
  assert.equal(removed.crs, undefined);
});

test("rejects invalid typed values before returning XML", () => {
  const project = createProject();
  project.rotation = Number.NaN;
  assert.throws(
    () => serializeQgs(project, { version: "4.2" }),
    (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
  );
  assert.throws(
    () =>
      parseQgs(
        '<qgis version="4.2.0"><ProjectViewSettings rotation="invalid"/></qgis>',
      ),
    (error) => error instanceof QgsError && error.code === "INVALID_PROJECT",
  );
});

test("unchanged authority-only and disabled CRS payloads retain their original XML", () => {
  for (const enabled of ["0", "1"]) {
    const xml = `<qgis version="4.2.0"><projectCrs><spatialrefsys><authid>EPSG:4326</authid></spatialrefsys></projectCrs><properties><SpatialRefSys><ProjectionsEnabled type="int">${enabled}</ProjectionsEnabled></SpatialRefSys></properties></qgis>`;
    const project = parseQgs(xml);
    assert.equal(
      project.crs?.authId,
      enabled === "1" ? "EPSG:4326" : undefined,
    );
    assert.deepEqual(
      readXml(serializeQgs(project, { version: "4.2" })),
      readXml(xml),
    );
  }
});

for (const fixture of ["qgis3", "qgis4"]) {
  test(`preserves all XML in an unmodified typed ${fixture} model, including after JSON storage`, () => {
    const xml = readFileSync(
      new URL(`./fixtures/${fixture}.qgs`, import.meta.url),
      "utf8",
    );
    const project = parseQgs(xml);
    const version = readXml(xml).root.attributes.version!;
    assert.deepEqual(readXml(serializeQgs(project, { version })), readXml(xml));
    assert.deepEqual(
      readXml(serializeQgs(JSON.parse(JSON.stringify(project)), { version })),
      readXml(xml),
    );
    const before = JSON.stringify(project);
    project.title = "edited";
    const edited = serializeQgs(project, { version });
    assert.equal(parseQgs(edited).title, "edited");
    // Snapshot is not updated when the typed model is serialized.
    assert.deepEqual(project.preservedXml, JSON.parse(before).preservedXml);
  });
}
