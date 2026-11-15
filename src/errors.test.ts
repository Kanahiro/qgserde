import assert from "node:assert/strict";
import { test } from "node:test";
import { QgsError } from "./errors.ts";

test("codec errors retain their category, message and original cause", () => {
  const cause = new Error("XML parser failed");
  const error = new QgsError("INVALID_XML", "Cannot parse input", { cause });
  assert.ok(error instanceof Error);
  assert.equal(error.name, "QgsError");
  assert.equal(error.code, "INVALID_XML");
  assert.equal(error.message, "Cannot parse input");
  assert.equal(error.cause, cause);
  assert.match(error.stack!, /QgsError: Cannot parse input/u);
});
