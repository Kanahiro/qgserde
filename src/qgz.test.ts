import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { QgsError } from "./errors.ts";
import { createProject } from "./project.ts";
import { parseQgz, serializeQgz } from "./qgz.ts";

const fixture = () =>
  new Uint8Array(
    readFileSync(
      new URL("../test/fixtures/qgis3-archive.qgz", import.meta.url),
    ),
  );

test("reads a QGIS archive and keeps companion files byte for byte", async () => {
  const archive = await parseQgz(fixture());
  assert.equal(archive.projectFile, "qgis3-archive.qgs");
  assert.equal(archive.project.title, "Archive");
  const names = Object.keys(archive.files);
  assert.equal(names.length, 1);
  assert.match(names[0]!, /_styles\.db$/u);
  archive.project.title = "Edited";
  const bytes = await serializeQgz(archive, { version: "3.44" });
  const again = await parseQgz(bytes);
  assert.equal(again.project.title, "Edited");
  assert.equal(again.projectFile, archive.projectFile);
  assert.deepEqual(again.files, archive.files);
  // Archives are reproducible.
  assert.deepEqual(
    await serializeQgz(again, { version: "3.44" }),
    await serializeQgz(again, { version: "3.44" }),
  );
});

test("writes archives that standard tools can read", async () => {
  const bytes = await serializeQgz(
    {
      project: createProject({ title: "日本語" }),
      projectFile: "地図.qgs",
      files: { "地図.qgd": new Uint8Array([1, 2, 3]) },
    },
    { version: "4.2" },
  );
  const directory = mkdtempSync(join(tmpdir(), "qgserde-"));
  const path = join(directory, "test.qgz");
  writeFileSync(path, bytes);
  let listing: string;
  try {
    listing = execFileSync("unzip", ["-l", path], { encoding: "utf8" });
  } catch {
    return; // unzip is optional on development machines.
  }
  assert.match(listing, /地図\.qgs/u);
  assert.match(listing, /地図\.qgd/u);
  execFileSync("unzip", ["-tq", path]);
});

test("rejects invalid archives", async () => {
  const invalid = async (data: Uint8Array, pattern: RegExp) =>
    assert.rejects(
      parseQgz(data),
      (error) =>
        error instanceof QgsError &&
        error.code === "INVALID_ARCHIVE" &&
        pattern.test(error.message),
    );
  await invalid(new Uint8Array([1, 2, 3]), /Not a ZIP/u);
  const corrupt = fixture();
  corrupt[60] = (corrupt[60] ?? 0) ^ 0xff;
  await assert.rejects(parseQgz(corrupt), QgsError);
  const empty = await serializeQgz(
    { project: createProject(), files: {} },
    { version: "4.2" },
  );
  assert.equal((await parseQgz(empty)).projectFile, "project.qgs");
  await assert.rejects(
    serializeQgz(
      { project: createProject(), files: { "other.qgs": new Uint8Array() } },
      { version: "4.2" },
    ),
    /Invalid archive file name/u,
  );
  await assert.rejects(
    serializeQgz(
      { project: createProject(), projectFile: "x.txt" },
      { version: "4.2" },
    ),
    /must end with .qgs/u,
  );
});
