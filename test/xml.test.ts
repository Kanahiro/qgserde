import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createElement,
  findChild,
  findChildren,
  getText,
  parseQgs,
  QgsError,
  serializeQgs,
  setText,
} from "../src/index.ts";

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<?plugin version="1"?>
<!--before-->
<qgis version="3.40.0-Bratislava" xmlns:plugin="urn:example" projectname="テスト &amp; 地図">
  <title>001 &amp; false</title>
  <plugin:config __proto__="literal" constructor="own" enabled="0">
    leading <item value="0001"/><item value="false"/> trailing
    <![CDATA["name" < 2 AND "label" != 'A&B']]>
    <!--keep--><?plugin keep?>
  </plugin:config>
  <projectlayers/>
</qgis>
<!--after-->`;

function errorCode(code: string): (error: unknown) => boolean {
  return (error) => error instanceof QgsError && error.code === code;
}

test("preserves ordered unknown elements, attributes, namespaces, comments, CDATA and instructions", () => {
  const project = parseQgs(sample);
  assert.deepEqual(parseQgs(serializeQgs(project)), project);
  assert.deepEqual(JSON.parse(JSON.stringify(project)), project);
  const config = findChild(project.root, "plugin:config");
  assert.ok(config);
  assert.equal(
    Object.getOwnPropertyDescriptor(config.attributes, "__proto__")?.value,
    "literal",
  );
  assert.equal(config.attributes.constructor, "own");
  assert.deepEqual(
    findChildren(config, "item").map((node) => node.attributes.value),
    ["0001", "false"],
  );
  assert.equal(findChildren(project.root, "item").length, 0);
  assert.equal(getText(findChild(project.root, "title")!), "001 & false");
});

test("edits text, attributes and arbitrary added elements without losing other content", () => {
  const project = parseQgs(sample);
  setText(findChild(project.root, "title")!, '札幌 < & > "');
  project.root.attributes.projectname = '\tA\nB\rC & < > "';
  project.root.children.push(
    createElement("日本語", { key: "007" }, [
      { type: "text", value: "\r\n001 & <" },
    ]),
  );
  const updated = parseQgs(serializeQgs(project));
  assert.deepEqual(updated, project);
  assert.equal(getText(findChild(updated.root, "title")!), '札幌 < & > "');
});

test("output does not mutate the source and normalizes only the XML encoding", () => {
  const project = parseQgs(sample.replace("UTF-8", "ISO-8859-1"));
  const before = JSON.stringify(project);
  assert.match(serializeQgs(project), /encoding="UTF-8"/u);
  assert.equal(JSON.stringify(project), before);
});

test("splits edited CDATA terminators and preserves CR characters", () => {
  const project = parseQgs('<qgis version="4.2.0"><value/></qgis>');
  findChild(project.root, "value")!.children = [
    { type: "cdata", value: "a]]>b\rc" },
  ];
  const result = parseQgs(serializeQgs(project));
  assert.equal(getText(findChild(result.root, "value")!), "a]]>b\rc");
});

test("accepts BOM, entities, empty elements and no XML declaration", () => {
  const project = parseQgs(
    '\uFEFF<qgis version="4.2"><a/><b></b><text>&#x1F5FA; &apos; &quot; &amp;</text></qgis>',
  );
  assert.equal(getText(findChild(project.root, "text")!), "🗺 ' \" &");
  assert.deepEqual(parseQgs(serializeQgs(project)), project);
});

for (const xml of [
  "",
  '<qgis version="3.40"><x></qgis>',
  '<qgis version="3.40"/><qgis version="3.40"/>',
  '<qgis version="3.40" version="3.44"/>',
  '<qgis version="3.40">&unknown;</qgis>',
  '<qgis version="3.40"><unbound:item/></qgis>',
  '<qgis version="3.40">\u0000</qgis>',
  '<?xml version="1.1"?><qgis version="3.40"/>',
  '<qgis version="3.40"><!-- a--b --></qgis>',
  '<!DOCTYPE qgis [<!ENTITY file SYSTEM "file:///etc/passwd">]><qgis version="3.40"/>',
  '<!DOCTYPE other><qgis version="3.40"/>',
]) {
  test(`rejects malformed or unsupported XML: ${JSON.stringify(xml).slice(0, 80)}`, () => {
    assert.throws(() => parseQgs(xml), errorCode("INVALID_XML"));
  });
}

test("never resolves an external DTD", () => {
  const project = parseQgs(
    '<!DOCTYPE qgis SYSTEM "https://invalid.invalid/never-fetch.dtd"><qgis version="3.40"/>',
  );
  assert.deepEqual(parseQgs(serializeQgs(project)), project);
});

test("requires a qgis root and a valid source version", () => {
  assert.throws(
    () => parseQgs('<other version="3.40"/>'),
    errorCode("INVALID_PROJECT"),
  );
  assert.throws(() => parseQgs("<qgis/>"), errorCode("INVALID_PROJECT"));
  assert.throws(
    () => parseQgs('<qgis version="unknown"/>'),
    errorCode("INVALID_VERSION"),
  );
});

test("rejects cyclic and excessively deep edited trees", () => {
  const project = parseQgs('<qgis version="3.40"/>');
  project.root.children.push(project.root);
  assert.throws(() => serializeQgs(project), errorCode("INVALID_EDIT"));
  assert.throws(() => getText(project.root), errorCode("INVALID_EDIT"));
  const nested =
    '<qgis version="3.40">' +
    "<x>".repeat(513) +
    "</x>".repeat(513) +
    "</qgis>";
  assert.throws(() => parseQgs(nested), errorCode("INVALID_XML"));
});

for (const mutate of [
  (p: ReturnType<typeof parseQgs>) => {
    p.root.children.push(createElement("x/><injected"));
  },
  (p: ReturnType<typeof parseQgs>) => {
    p.root.attributes['a="value" injected'] = "oops";
  },
  (p: ReturnType<typeof parseQgs>) => {
    p.root.children.push({ type: "comment", value: "a--b" });
  },
  (p: ReturnType<typeof parseQgs>) => {
    p.root.children.push({ type: "comment", value: "a-" });
  },
  (p: ReturnType<typeof parseQgs>) => {
    p.root.children.push({ type: "instruction", target: "x", body: "?>" });
  },
  (p: ReturnType<typeof parseQgs>) => {
    p.root.children.push({ type: "text", value: "\u0001" });
  },
  (p: ReturnType<typeof parseQgs>) => {
    p.root.children.push(createElement("missing:namespace"));
  },
]) {
  test("rejects invalid edits before returning XML", () => {
    const project = parseQgs(sample);
    mutate(project);
    assert.throws(() => serializeQgs(project), errorCode("INVALID_EDIT"));
  });
}

test("round trips a real upstream QGIS 3 project including styles, layer order and CRS", () => {
  const xml = readFileSync(
    new URL("./fixtures/qgis3.qgs", import.meta.url),
    "utf8",
  );
  const project = parseQgs(xml);
  assert.ok(project.root.attributes.version?.startsWith("3."));
  assert.deepEqual(parseQgs(serializeQgs(project)), project);
});
