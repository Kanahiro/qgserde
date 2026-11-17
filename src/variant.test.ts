import assert from "node:assert/strict";
import { test } from "node:test";
import { QgsError } from "./errors.ts";
import type { XmlElement } from "./types.ts";
import {
  bindVariant,
  readProperties,
  readVariant,
  writeProperties,
  writeVariant,
} from "./variant.ts";
import { parseQgisVersion } from "./version.ts";
import { findChildren, readXml, writeXml } from "./xml.ts";

const xml = (source: string) => readXml(source).root;
const text = (element: XmlElement) =>
  writeXml({ before: [], root: element, after: [] });

test("reads QGIS variant types as plain values", () => {
  const element = xml(
    `<Option type="Map">
      <Option name="s" type="QString" value="a"/>
      <Option name="i" type="int" value="2"/>
      <Option name="d" type="double" value="2.5"/>
      <Option name="empty" type="double" value=""/>
      <Option name="b" type="bool" value="true"/>
      <Option name="one" type="bool" value="1"/>
      <Option name="c" type="color" value="1,2,3,255"/>
      <Option name="n" type="invalid"/>
      <Option name="unset"/>
      <Option name="l" type="List"><Option type="int" value="1"/><Option type="QString" value="x"/></Option>
      <Option name="sl" type="StringList"><Option type="QString" value="y"/></Option>
      <Option name="p" type="QgsProperty"><Option type="Map"><Option name="active" type="bool" value="false"/></Option></Option>
      <Option name="crs" type="QgsCoordinateReferenceSystem"><spatialrefsys/></Option>
      <Option name="__proto__" type="QString" value="own"/>
    </Option>`,
  );
  const value = readVariant(element) as Record<string, unknown>;
  // Keys become own properties; "__proto__" never changes the prototype.
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.ok(Object.hasOwn(value, "__proto__"));
  assert.equal(
    Object.getOwnPropertyDescriptor(value, "__proto__")?.value,
    "own",
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "__proto__"),
    ),
    {
      s: "a",
      i: 2,
      d: 2.5,
      empty: 0,
      b: true,
      // QGIS compares bool text with "true" only.
      one: false,
      c: "1,2,3,255",
      n: null,
      unset: null,
      l: [1, "x"],
      sl: ["y"],
      p: { active: false },
      crs: null,
    },
  );
  assert.throws(
    () => readVariant(xml('<Option type="double" value="nan"/>')),
    (error) => error instanceof QgsError && error.code === "INVALID_PROJECT",
  );
});

test("writes variants while keeping matching elements, stored types and order", () => {
  const element = xml(
    '<Option type="Map"><!--keep--><Option name="z" type="double" value="1"/><Option name="c" type="color" value="0,0,0,255"/><Option name="gone" type="QString" value="x"/><Option name="crs" type="QgsCoordinateReferenceSystem"><spatialrefsys/></Option><Option name="u" type="uint" value="1"/><Option name="empty"/></Option>',
  );
  writeVariant(element, {
    a: "new",
    z: 2,
    c: "255,0,0,255",
    crs: null,
    u: -1,
    empty: {},
    big: 2 ** 40,
    f: 0.25,
    list: [true, null],
  });
  assert.equal(
    text(element),
    '<Option type="Map"><!--keep--><Option name="z" type="double" value="2"/><Option name="c" type="color" value="255,0,0,255"/><Option name="crs" type="QgsCoordinateReferenceSystem"><spatialrefsys/></Option><Option name="u" type="int" value="-1"/><Option name="empty"/><Option name="a" type="QString" value="new"/><Option name="big" type="qlonglong" value="1099511627776"/><Option name="f" type="double" value="0.25"/><Option name="list" type="List"><Option type="bool" value="true"/><Option/></Option></Option>',
  );
  writeVariant(element, "scalar");
  assert.equal(
    text(element),
    '<Option type="QString" value="scalar"><!--keep--></Option>',
  );
  for (const invalid of [Number.NaN, new Date(), () => {}])
    assert.throws(
      () => writeVariant(xml("<Option/>"), invalid as never),
      (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
    );
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(
    () => writeVariant(xml("<Option/>"), cyclic as never),
    /Cyclic/u,
  );
});

test("wrapped variants stay wrapped while their value remains a map", () => {
  const element = xml(
    '<Option type="QgsProperty"><Option type="Map"><Option name="active" type="bool" value="true"/></Option></Option>',
  );
  writeVariant(element, { active: false, type: 3 });
  assert.equal(
    text(element),
    '<Option type="QgsProperty"><Option type="Map"><Option name="active" type="bool" value="false"/><Option name="type" type="int" value="3"/></Option></Option>',
  );
});

test("binds every scalar value to its model path", () => {
  const element = xml(
    '<Option type="Map"><Option name="a" type="bool" value="true"/><Option name="l" type="List"><Option type="int" value="1"/></Option><Option name="x" type="QgsCoordinateReferenceSystem"/></Option>',
  );
  const bound: string[] = [];
  bindVariant(
    (_, attribute, path, format) =>
      bound.push(`${attribute}:${path.join("/")}:${format ?? ""}`),
    element,
    ["root"],
  );
  assert.deepEqual(bound, ["value:root/a:boolean", "value:root/l/0:"]);
});

test("properties use <prop> before QGIS 3.18 and an <Option> map afterwards", () => {
  const legacy = xml(
    '<layer class="SimpleFill"><prop k="color" v="0,0,0,255"/><prop k="gone" v="1"/><effect/></layer>',
  );
  assert.deepEqual(readProperties(legacy), { color: "0,0,0,255", gone: "1" });
  const modern = structuredClone(legacy);
  const properties = { color: "1,1,1,255", width: 0.5, flag: true };
  writeProperties(legacy, properties, parseQgisVersion("3.16"));
  assert.equal(
    text(legacy),
    '<layer class="SimpleFill"><prop k="color" v="1,1,1,255"/><prop k="width" v="0.5"/><prop k="flag" v="true"/><effect/></layer>',
  );
  writeProperties(modern, properties, parseQgisVersion("3.18"));
  assert.equal(
    text(modern),
    '<layer class="SimpleFill"><Option type="Map"><Option name="color" type="QString" value="1,1,1,255"/><Option name="width" type="double" value="0.5"/><Option name="flag" type="bool" value="true"/></Option><effect/></layer>',
  );
  assert.deepEqual(readProperties(modern), properties);
  // QGIS 3.18-3.3x wrote both forms; the map wins on read and the copy is dropped.
  const both = xml(
    '<layer><Option type="Map"><Option name="a" type="QString" value="map"/></Option><prop k="a" v="prop"/></layer>',
  );
  assert.deepEqual(readProperties(both), { a: "map" });
  writeProperties(both, { a: "edited" }, parseQgisVersion("4.2"));
  assert.equal(findChildren(both, "prop").length, 0);
  assert.throws(
    () =>
      writeProperties(
        xml("<layer/>"),
        { nested: { a: "b" } },
        parseQgisVersion("3.10"),
      ),
    /before 3.18/u,
  );
  assert.throws(
    () =>
      writeProperties(xml("<layer/>"), [] as never, parseQgisVersion("4.2")),
    /plain object/u,
  );
});
