import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  parseJson,
  parseQgs,
  QgsError,
  serializeJson,
  serializeQgs,
} from "../src/index.ts";
import { findChild, findChildren, getText, readXml } from "../src/xml.ts";

const fixture = () =>
  parseQgs(
    readFileSync(
      new URL("./fixtures/qgis3-project-settings.qgs", import.meta.url),
      "utf8",
    ),
  );

test("reads typed project properties without the CRS-managed key", () => {
  const project = fixture();
  assert.deepEqual(project.properties?.Variables, {
    variableNames: ["city", "zoom"],
    variableValues: ["Sapporo", "12"],
  });
  assert.equal(project.properties?.WMSServiceCapabilities, 1);
  assert.equal(
    (project.properties!.PAL as Record<string, unknown>).DrawUnplaced,
    false,
  );
  assert.equal(
    (project.properties!.PAL as Record<string, unknown>).CandidatesLinePerCM,
    5,
  );
  assert.equal(project.properties?.SpatialRefSys, undefined);
});

test("edits project properties in both QGIS 3 and QGIS 4 forms", () => {
  const project = fixture();
  const properties = project.properties!;
  (properties.Variables as Record<string, unknown>).variableNames = ["city"];
  (properties.Variables as Record<string, unknown>).variableValues = ["Tokyo"];
  properties.WMSServiceTitle = "Renamed";
  (properties.PAL as Record<string, unknown>).CandidatesLinePerCM = 7.5;
  delete properties.Digitizing;
  properties.NewKey = { nested: true };
  for (const version of ["3.34", "4.2"]) {
    const output = serializeQgs(parseJson(serializeJson(project)), { version });
    const reparsed = parseQgs(output);
    assert.deepEqual(reparsed.properties?.Variables, {
      variableNames: ["city"],
      variableValues: ["Tokyo"],
    });
    assert.equal(reparsed.properties?.WMSServiceTitle, "Renamed");
    assert.equal(reparsed.properties?.Digitizing, undefined);
    assert.deepEqual(reparsed.properties?.NewKey, { nested: true });
    assert.equal(reparsed.crs?.authId, "EPSG:3857");
    const root = findChild(readXml(output).root, "properties")!;
    // The CRS-managed key is still written.
    const spatial = findChildren(root).find(
      (child) =>
        child.name === "SpatialRefSys" ||
        child.attributes.name === "SpatialRefSys",
    )!;
    assert.equal(getText(findChildren(spatial)[0]!), "1");
  }
  // Doubles keep their stored type; an integral value stays a double.
  (properties.PAL as Record<string, unknown>).CandidatesLinePerCM = 6;
  assert.match(
    serializeQgs(project, { version: "3.34" }),
    /<CandidatesLinePerCM type="double">6<\/CandidatesLinePerCM>/u,
  );
});

test("QGIS 4 named properties are created for new keys", () => {
  const project = parseQgs(
    readFileSync(
      new URL("./fixtures/qgis4-translation.qgs", import.meta.url),
      "utf8",
    ),
  );
  project.properties!.Added = { Key: "value" };
  const output = serializeQgs(project, { version: "4.2" });
  assert.match(
    output,
    /<properties name="Added">\s*<properties name="Key" type="QString">value<\/properties>\s*<\/properties>/u,
  );
  assert.match(
    serializeQgs(project, { version: "3.44" }),
    /<Added>\s*<Key type="QString">value<\/Key>/u,
  );
  project.properties!.Bad = { value: null } as never;
  assert.throws(
    () => serializeQgs(project, { version: "4.2" }),
    (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
  );
});

test("edits relations, themes, bookmarks, and tree node settings", () => {
  const project = fixture();
  project.relations![0]!.attributes!.strength = "Composition";
  project.mapThemes![0]!.name = "Renamed theme";
  project.bookmarks![0]!.crs = { authId: "EPSG:3857" };
  const group = project.layerTree!.children[2]!;
  group.customProperties = { "plugin/flag": "y" };
  group.attributes!["mutually-exclusive"] = "0";
  project.timeSettings!.range!.end = "2022-01-01T00:00:00Z";
  const output = serializeQgs(project, { version: "3.34" });
  const reparsed = parseQgs(output);
  assert.equal(reparsed.relations?.[0]?.attributes?.strength, "Composition");
  assert.equal(reparsed.mapThemes?.[0]?.name, "Renamed theme");
  assert.equal(reparsed.bookmarks?.[0]?.crs?.authId, "EPSG:3857");
  assert.equal(reparsed.bookmarks?.[0]?.crs?.wkt, undefined);
  const node = reparsed.layerTree!.children[2]!;
  assert.deepEqual(node.customProperties, { "plugin/flag": "y" });
  assert.equal(node.attributes?.["mutually-exclusive"], "0");
  assert.equal(reparsed.timeSettings?.range?.end, "2022-01-01T00:00:00Z");
});
