import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProject,
  findChild,
  getProjectTitle,
  getText,
  parseQgisVersion,
  parseQgs,
  QgsError,
  serializeQgs,
  setProjectTitle,
  setText,
} from "../src/index.ts";

test("updates all title storage locations without discarding other metadata", () => {
  const project = parseQgs(
    '<qgis version="4.2" projectname="old"><title>legacy</title><projectMetadata><title>metadata</title><author>keep</author></projectMetadata></qgis>',
  );
  assert.equal(getProjectTitle(project), "metadata");
  setProjectTitle(project, "新しい地図");
  assert.equal(getProjectTitle(project), "新しい地図");
  assert.equal(getText(findChild(project.root, "title")!), "新しい地図");
  const metadata = findChild(project.root, "projectMetadata")!;
  assert.equal(getText(findChild(metadata, "title")!), "新しい地図");
  assert.equal(getText(findChild(metadata, "author")!), "keep");
  assert.equal(project.root.attributes.projectname, "新しい地図");
  setProjectTitle(project, "");
  assert.equal(getProjectTitle(project), "");
});

test("creates QGIS 3 and QGIS 4 projects at the requested version", () => {
  for (const version of [
    "3.28",
    "3.34.15-Prizren",
    "3.40",
    "3.44",
    "4.0",
    "4.2.0-Belém do Pará",
  ]) {
    const project = createProject(version, "札幌 & 地図");
    assert.deepEqual(parseQgs(serializeQgs(project)), project);
    assert.equal(getText(findChild(project.root, "title")!), "札幌 & 地図");
    assert.equal(project.root.attributes.projectname, "札幌 & 地図");
  }
});

test("rejects unsupported creation versions and malformed versions", () => {
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

test("normalizes abbreviated target versions, and permits release-name changes", () => {
  const project = createProject("3.40.0-Bratislava");
  const xml = serializeQgs(project, { version: "3.40" });
  assert.equal(parseQgs(xml).root.attributes.version, "3.40.0");
  assert.equal(project.root.attributes.version, "3.40.0-Bratislava");
});

test("requires an explicit policy or migration for upgrades, downgrades and patch changes", () => {
  for (const version of ["3.28", "3.44", "3.40.1", "4.2"]) {
    assert.throws(
      () => serializeQgs(createProject("3.40"), { version }),
      (error) =>
        error instanceof QgsError && error.code === "MIGRATION_REQUIRED",
    );
  }
});

test("preserve policy retains all data and changes only the version label", () => {
  const project = createProject("3.40");
  const output = parseQgs(
    serializeQgs(project, { version: "4.2", versionPolicy: "preserve" }),
  );
  const expected = structuredClone(project);
  expected.root.attributes.version = "4.2.0";
  assert.deepEqual(output, expected);
  assert.equal(project.root.attributes.version, "3.40.0");
});

test("runs a version migration on an isolated copy", () => {
  const project = createProject("3.40", "before");
  const before = JSON.stringify(project);
  const output = parseQgs(
    serializeQgs(project, {
      version: "4.2",
      migrate(copy, versions) {
        assert.deepEqual(versions, { from: "3.40.0", to: "4.2.0" });
        setText(findChild(copy.root, "title")!, "migrated");
      },
    }),
  );
  assert.equal(output.root.attributes.version, "4.2.0");
  assert.equal(getText(findChild(output.root, "title")!), "migrated");
  assert.equal(JSON.stringify(project), before);
});

test("failed or invalid migrations leave the source untouched", () => {
  const project = createProject("3.40");
  const before = JSON.stringify(project);
  assert.throws(
    () =>
      serializeQgs(project, {
        version: "4.2",
        migrate(copy) {
          copy.root.attributes.changed = "yes";
          throw new Error("cannot migrate");
        },
      }),
    /cannot migrate/u,
  );
  assert.equal(JSON.stringify(project), before);
  assert.throws(
    () =>
      serializeQgs(project, {
        version: "4.2",
        migrate(copy) {
          copy.root.name = "other";
        },
      }),
    (error) => error instanceof QgsError && error.code === "INVALID_PROJECT",
  );
});
