import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boolean,
  ensure,
  number,
  putAttribute,
  putElementText,
  putNumber,
  putText,
  readCrs,
  readExtent,
  remove,
  replaceChildren,
  text,
  writeCrs,
  writeExtent,
} from "./codec.ts";
import { QgsError } from "./errors.ts";
import { createElement, findChild, getText, readXml } from "./xml.ts";

test("numbers distinguish missing values, zero and non-finite input", () => {
  for (const value of [undefined, "", " \t\n"])
    assert.equal(number(value), undefined);
  for (const [value, expected] of [
    ["0", 0],
    ["-1.5", -1.5],
    [" 1e2 ", 100],
    ["0001", 1],
  ] as const)
    assert.equal(number(value), expected);
  for (const value of ["NaN", "Infinity", "-Infinity", "1e309", "1px"])
    assert.throws(
      () => number(value),
      (error) => error instanceof QgsError && error.code === "INVALID_PROJECT",
    );
});

test("booleans accept only the four QGIS scalar spellings", () => {
  assert.equal(boolean(undefined), undefined);
  for (const value of ["true", "1"]) assert.equal(boolean(value), true);
  for (const value of ["false", "0"]) assert.equal(boolean(value), false);
  for (const value of ["", "True", "yes", "2", " true "])
    assert.throws(
      () => boolean(value),
      (error) => error instanceof QgsError && error.code === "INVALID_PROJECT",
    );
});

test("scalar edits preserve unchanged spellings, comments and CDATA boundaries", () => {
  const parent = readXml(
    '<root flag="true" count="1e2"><count>1e2</count><label>A<!--keep--><![CDATA[BC]]><?plugin keep?>D</label></root>',
  ).root;
  const before = structuredClone(parent);
  putAttribute(parent, "flag", true);
  putAttribute(parent, "count", 100);
  putNumber(parent, "count", 100);
  putText(parent, "label", "ABCD");
  assert.deepEqual(parent, before);
  putText(parent, "label", "longer");
  assert.deepEqual(findChild(parent, "label")!.children, [
    { type: "text", value: "l" },
    { type: "comment", value: "keep" },
    { type: "cdata", value: "on" },
    { type: "instruction", target: "plugin", body: "keep" },
    { type: "text", value: "ger" },
  ]);
  putText(parent, "label", "");
  assert.equal(text(parent, "label"), "");
  assert.equal(findChild(parent, "label")!.children.length, 5);
});

test("nested scalar markup can be retained unchanged but never silently overwritten", () => {
  const element = readXml("<label>A<plugin>B</plugin>C</label>").root;
  const before = structuredClone(element);
  putElementText(element, "ABC");
  assert.deepEqual(element, before);
  assert.throws(
    () => putElementText(element, "changed"),
    (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
  );
  assert.deepEqual(element, before);
  const commentOnly = readXml("<label><!--keep--></label>").root;
  putElementText(commentOnly, "added");
  assert.deepEqual(commentOnly.children, [
    { type: "comment", value: "keep" },
    { type: "text", value: "added" },
  ]);
});

test("scalar creation and removal affect only direct children and named attributes", () => {
  const parent = readXml(
    '<root keep="yes"><value>one</value><!--keep--><other><value>nested</value></other><value>two</value></root>',
  ).root;
  assert.equal(ensure(parent, "value"), findChild(parent, "value"));
  putText(parent, "new", "");
  assert.equal(text(parent, "new"), "");
  putText(parent, "value", undefined);
  putNumber(parent, "new", undefined);
  remove(parent, "missing");
  assert.deepEqual(
    parent,
    readXml(
      '<root keep="yes"><!--keep--><other><value>nested</value></other></root>',
    ).root,
  );
  putAttribute(parent, "flag", false);
  assert.equal(parent.attributes.flag, "0");
  putAttribute(parent, "flag", undefined);
  assert.deepEqual(parent.attributes, { keep: "yes" });
});

test("numeric edits reject non-finite values and text edits reject non-strings", () => {
  const parent = createElement("root");
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(
      () => putNumber(parent, "number", value),
      (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
    );
    assert.throws(
      () => putAttribute(parent, "number", value),
      (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
    );
  }
  assert.throws(
    () => Reflect.apply(putText, undefined, [parent, "text", 42]),
    (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
  );
  assert.throws(
    () => Reflect.apply(putNumber, undefined, [parent, "number", "42"]),
    (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
  );
});

for (const [name, replacements, expected] of [
  [
    "grow",
    ["a", "b", "c"],
    '<root><item id="a"/><!--keep--><other/><item id="b"/><item id="c"/><tail/></root>',
  ],
  ["shrink", ["a"], '<root><item id="a"/><!--keep--><other/><tail/></root>'],
  ["clear", [], "<root><!--keep--><other/><tail/></root>"],
] as const) {
  test(`list replacement preserves unrelated sibling positions when lists ${name}`, () => {
    const parent = readXml(
      '<root><item id="old-a"/><!--keep--><other/><entry id="old-b"/><tail/></root>',
    ).root;
    replaceChildren(
      parent,
      ["item", "entry"],
      replacements.map((id) => createElement("item", { id })),
    );
    assert.deepEqual(parent, readXml(expected).root);
  });
}

test("list replacement appends when no old item exists", () => {
  const parent = readXml("<root><!--keep--><other/></root>").root;
  replaceChildren(parent, ["item"], [createElement("item")]);
  assert.deepEqual(
    parent,
    readXml("<root><!--keep--><other/><item/></root>").root,
  );
});

test("CRS decoding keeps typed values and opaque definition strings", () => {
  const parent = readXml(
    '<root><srs><spatialrefsys nativeFormat="Wkt"><authid>EPSG:4326</authid><wkt>opaque WKT</wkt><proj4>+proj=longlat</proj4><description>地図</description><projectionacronym>longlat</projectionacronym><ellipsoidacronym>EPSG:7030</ellipsoidacronym><srsid>3452</srsid><srid>4326</srid><geographicflag>1</geographicflag></spatialrefsys></srs></root>',
  ).root;
  const expected = {
    authId: "EPSG:4326",
    wkt: "opaque WKT",
    proj4: "+proj=longlat",
    description: "地図",
    projectionAcronym: "longlat",
    ellipsoidAcronym: "EPSG:7030",
    srsId: 3452,
    srid: 4326,
    geographic: true,
    nativeFormat: "Wkt",
  };
  assert.deepEqual(readCrs(parent, "srs"), expected);
  const before = structuredClone(parent);
  writeCrs(parent, "srs", expected);
  assert.deepEqual(parent, before);
});

test("authority lookup markers distinguish new, unchanged and edited legacy CRS", () => {
  const parent = readXml(
    "<root><srs><spatialrefsys><authid>EPSG:4326</authid></spatialrefsys></srs></root>",
  ).root;
  const crs = readCrs(parent, "srs")!;
  const before = structuredClone(parent);
  writeCrs(parent, "srs", crs);
  assert.deepEqual(parent, before);
  crs.authId = "EPSG:3857";
  writeCrs(parent, "srs", crs);
  assert.equal(readCrs(parent, "srs")!.srsId, 1);
  for (const [definition, marker] of [
    [{ authId: "EPSG:4326" }, 1],
    [{ authId: "EPSG:4326", srsId: 3452 }, 3452],
    [{ authId: "USER:100001" }, undefined],
    [{ authId: "user:100001" }, undefined],
    [{ authId: "EPSG:4326", wkt: "custom definition" }, undefined],
    [{ authId: "EPSG:4326", proj4: "+proj=longlat" }, undefined],
  ] as const) {
    const fresh = createElement("root");
    writeCrs(fresh, "srs", definition);
    assert.equal(readCrs(fresh, "srs")!.srsId, marker);
  }
});

test("removing a CRS retains unmodeled empty containers and removes active definitions", () => {
  const parent = readXml('<root><srs plugin="keep"/></root>').root;
  const before = structuredClone(parent);
  assert.equal(readCrs(parent, "srs"), undefined);
  writeCrs(parent, "srs", undefined);
  assert.deepEqual(parent, before);
  writeCrs(parent, "srs", { authId: "EPSG:4326" });
  writeCrs(parent, "srs", undefined);
  assert.equal(findChild(parent, "srs"), undefined);
});

test("extent decoding supports both representations and prefers attributes", () => {
  const parent = readXml(
    '<root><extent xmin="1"><xmin>99</xmin><ymin>2</ymin><xmax>3</xmax><ymax>4</ymax></extent></root>',
  ).root;
  assert.deepEqual(readExtent(parent), { xmin: 1, ymin: 2, xmax: 3, ymax: 4 });
  const before = structuredClone(parent);
  writeExtent(parent, { xmin: -1, ymin: -2, xmax: 30, ymax: 40 });
  const extent = findChild(parent, "extent")!;
  assert.equal(extent.attributes.xmin, "-1");
  assert.equal(text(extent, "xmin"), "99");
  assert.equal(text(extent, "ymin"), "-2");
  assert.equal(getText(findChild(before, "extent")!), "99234");
});

test("extents reject incomplete or non-finite coordinates", () => {
  for (const body of [
    '<extent xmin="1" ymin="2" xmax="3"/>',
    '<extent xmin="1" ymin="" xmax="3" ymax="4"/>',
    '<extent xmin="1" ymin="2" xmax="Infinity" ymax="4"/>',
  ]) {
    const parent = readXml(`<root>${body}</root>`).root;
    assert.throws(
      () => readExtent(parent),
      (error) => error instanceof QgsError && error.code === "INVALID_PROJECT",
    );
  }
  const parent = createElement("root");
  assert.throws(
    () => writeExtent(parent, { xmin: 0, ymin: 0, xmax: NaN, ymax: 1 }),
    (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
  );
});

test("extent creation uses target storage and removal retains empty extension containers", () => {
  const parent = readXml('<root><extent plugin="keep"/></root>').root;
  const before = structuredClone(parent);
  assert.equal(readExtent(parent), undefined);
  writeExtent(parent, undefined);
  assert.deepEqual(parent, before);
  const coordinates = { xmin: 0, ymin: -1, xmax: 2, ymax: 3 };
  writeExtent(parent, coordinates);
  assert.equal(text(findChild(parent, "extent")!, "xmin"), "0");
  writeExtent(parent, coordinates, "DefaultViewExtent");
  assert.deepEqual(findChild(parent, "DefaultViewExtent")!.attributes, {
    xmin: "0",
    ymin: "-1",
    xmax: "2",
    ymax: "3",
  });
  writeExtent(parent, undefined);
  assert.equal(findChild(parent, "extent"), undefined);
});
