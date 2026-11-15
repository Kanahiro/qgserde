import assert from "node:assert/strict";
import { test } from "node:test";
import { QgsError } from "./errors.ts";
import { normalizeVersion, parseQgisVersion } from "./version.ts";

for (const [input, expected] of [
  ["0.0", { major: 0, minor: 0, patch: 0 }],
  ["3.40", { major: 3, minor: 40, patch: 0 }],
  ["4.2.1", { major: 4, minor: 2, patch: 1 }],
  [
    "4.2.0-Belém do Pará",
    { major: 4, minor: 2, patch: 0, suffix: "Belém do Pará" },
  ],
  [
    "9007199254740991.0.0",
    { major: Number.MAX_SAFE_INTEGER, minor: 0, patch: 0 },
  ],
] as const) {
  test(`parses version ${input}`, () => {
    assert.deepEqual(parseQgisVersion(input), expected);
  });
}

for (const input of [
  "",
  "3",
  "v3.40",
  " 3.40",
  "3.40 ",
  "3.40\n",
  "03.40",
  "3.04",
  "3.40.00",
  "3.-1",
  "3.40.x",
  "3.40.0.1",
  "3.40-",
  "3.40-<release>",
  "3.40-A&B",
  '3.40-A"B',
  "3.40-A'B",
  "3.40-A\u0000B",
  "9007199254740992.0",
  "3.9007199254740992",
  "3.40.9007199254740992",
  undefined,
  null,
  3.4,
]) {
  test(`rejects invalid version ${JSON.stringify(input)}`, () => {
    assert.throws(
      () => Reflect.apply(parseQgisVersion, undefined, [input]),
      (error) => error instanceof QgsError && error.code === "INVALID_VERSION",
    );
  });
}

test("normalizes supported output versions while keeping release names", () => {
  assert.equal(normalizeVersion("3.44"), "3.44.0");
  assert.equal(normalizeVersion("4.2.1-Belém do Pará"), "4.2.1-Belém do Pará");
});

test("parses unsupported major versions but rejects them as output targets", () => {
  for (const version of ["0.0", "2.18", "5.0"]) {
    assert.equal(parseQgisVersion(version).patch, 0);
    assert.throws(
      () => normalizeVersion(version),
      (error) => error instanceof QgsError && error.code === "INVALID_VERSION",
    );
  }
});
