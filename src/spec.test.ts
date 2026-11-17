import assert from "node:assert/strict";
import { test } from "node:test";
import { ExtensionCodec } from "./extensions.ts";
import {
  captureOwned,
  readOwned,
  restoreOwned,
  type Spec,
  writeOwned,
} from "./spec.ts";
import type { XmlElement } from "./types.ts";
import { parseQgisVersion } from "./version.ts";
import { readXml, writeXml } from "./xml.ts";

const spec: Spec = {
  tag: "item",
  entries: [
    {
      kind: "attributes",
      field: "attributes",
      table: {
        size: "number",
        enabled: "boolean",
        visible: "flag",
        name: "string",
      },
    },
    {
      kind: "records",
      field: "rows",
      at: [],
      item: "row",
      table: { w: "number", on: "boolean" },
    },
  ],
};

function element(xml: string): XmlElement {
  return readXml(xml).root;
}

function roundTrip(
  xml: string,
  edit?: (model: Record<string, unknown>) => void,
): {
  model: Record<string, unknown>;
  xml: string;
} {
  const source = element(xml);
  const reader = new ExtensionCodec();
  const model = readOwned(spec, source, reader);
  captureOwned(spec, model, reader);
  const copy = JSON.parse(JSON.stringify(model));
  edit?.(copy);
  const writer = new ExtensionCodec();
  restoreOwned(spec, copy, writer, "3.44.0");
  const out = writeOwned(spec, copy, writer, parseQgisVersion("3.44"));
  return { model, xml: writeXml({ ...readXml(xml), root: out }) };
}

test("typed attributes parse, keep unparsable values in other, and round-trip", () => {
  const xml = `<item size="2.5" enabled="true" visible="1" name="a" size2="x" extra="y"><row w="3" on="0" k="v"/><row w="auto"/></item>`;
  const { model, xml: out } = roundTrip(xml);
  assert.deepEqual(
    { ...model, extensions: undefined },
    {
      attributes: {
        size: 2.5,
        enabled: true,
        visible: true,
        name: "a",
        other: { size2: "x", extra: "y" },
      },
      rows: [{ w: 3, on: false, other: { k: "v" } }, { other: { w: "auto" } }],
      extensions: undefined,
    },
  );
  assert.equal(out, writeXml(readXml(xml)));
});

test("edits keep the stored boolean spelling and typed values win over other", () => {
  const { xml } = roundTrip(
    `<item size="0x1" enabled="true" visible="1"><row w="3" on="1"/></item>`,
    (model) => {
      const attributes = model.attributes as Record<string, unknown>;
      attributes.size = 4;
      attributes.other = undefined;
      attributes.enabled = false;
      attributes.visible = false;
      const [row] = model.rows as Record<string, unknown>[];
      if (row) row.on = false;
    },
  );
  // An attribute moved from `other` to its typed field is appended.
  assert.match(xml, /<item enabled="false" visible="0" size="4">/u);
  assert.match(xml, /<row w="3" on="0"\/>/u);
});
