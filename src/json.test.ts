import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { QgsError } from "./errors.ts";
import { parseJson, serializeJson, VERSION } from "./json.ts";
import { createProject } from "./project.ts";

const is = (code: string) => (error: unknown) =>
  error instanceof QgsError && error.code === code;

test("VERSION matches package.json", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  assert.equal(VERSION, pkg.version);
});

test("round-trips a project inside a versioned envelope", () => {
  const project = createProject({ title: "t" });
  const json = serializeJson(project);
  assert.equal(JSON.parse(json).qgserde, VERSION);
  assert.deepEqual(parseJson(json), project);
});

test("rejects malformed JSON and envelopes", () => {
  for (const json of [
    "{",
    "null",
    "[]",
    '{"project":{}}',
    '{"qgserde":"0.1.0"}',
    '{"qgserde":"0.1.0","project":[]}',
  ])
    assert.throws(() => parseJson(json), is("INVALID_JSON"), json);
});

test("accepts compatible versions and rejects incompatible ones", () => {
  const [major, minor] = VERSION.split(".").map(Number) as [number, number];
  const wrap = (v: string) => JSON.stringify({ qgserde: v, project: {} });
  for (const v of [
    `${major}.${minor}.0`,
    `${major}.${minor}.99`,
    `${major}.${minor}.0-beta.1`,
  ])
    assert.doesNotThrow(() => parseJson(wrap(v)), v);
  for (const v of [
    `${major + 1}.0.0`,
    ...(major === 0 ? [`0.${minor + 1}.0`] : []),
    "garbage",
  ])
    assert.throws(() => parseJson(wrap(v)), is("INVALID_VERSION"), v);
});
