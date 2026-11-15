import assert from "node:assert/strict";
import { test } from "node:test";
import { QgsError } from "./errors.ts";
import {
  createElement,
  findChild,
  findChildren,
  getText,
  readXml,
  setText,
  writeXml,
} from "./xml.ts";

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
  const project = readXml(sample);
  assert.deepEqual(readXml(writeXml(project)), project);
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
  const project = readXml(sample);
  setText(findChild(project.root, "title")!, '札幌 < & > "');
  project.root.attributes.projectname = '\tA\nB\rC & < > "';
  project.root.children.push(
    createElement("日本語", { key: "007" }, [
      { type: "text", value: "\r\n001 & <" },
    ]),
  );
  const updated = readXml(writeXml(project));
  assert.deepEqual(updated, project);
  assert.equal(getText(findChild(updated.root, "title")!), '札幌 < & > "');
});

test("output does not mutate the source and normalizes only the XML encoding", () => {
  const project = readXml(sample.replace("UTF-8", "ISO-8859-1"));
  const before = JSON.stringify(project);
  assert.match(writeXml(project), /encoding="UTF-8"/u);
  assert.equal(JSON.stringify(project), before);
});

test("splits edited CDATA terminators and preserves CR characters", () => {
  const project = readXml('<qgis version="4.2.0"><value/></qgis>');
  findChild(project.root, "value")!.children = [
    { type: "cdata", value: "a]]>b\rc" },
  ];
  const result = readXml(writeXml(project));
  assert.equal(getText(findChild(result.root, "value")!), "a]]>b\rc");
});

test("accepts BOM, entities, empty elements and no XML declaration", () => {
  const project = readXml(
    '\uFEFF<qgis version="4.2"><a/><b></b><text>&#x1F5FA; &apos; &quot; &amp;</text></qgis>',
  );
  assert.equal(getText(findChild(project.root, "text")!), "🗺 ' \" &");
  assert.deepEqual(readXml(writeXml(project)), project);
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
    assert.throws(() => readXml(xml), errorCode("INVALID_XML"));
  });
}

test("never resolves an external DTD", () => {
  const project = readXml(
    '<!DOCTYPE qgis SYSTEM "https://invalid.invalid/never-fetch.dtd"><qgis version="3.40"/>',
  );
  assert.deepEqual(readXml(writeXml(project)), project);
});

test("element lookups include only direct children in document order", () => {
  const root = readXml(
    '<root><item id="first"/><!--keep--><group><item id="nested"/></group><item id="last"/></root>',
  ).root;
  assert.deepEqual(
    findChildren(root).map((node) => node.name),
    ["item", "group", "item"],
  );
  assert.deepEqual(
    findChildren(root, "item").map((node) => node.attributes.id),
    ["first", "last"],
  );
  assert.equal(findChild(root, "item"), findChildren(root, "item")[0]);
  assert.equal(findChild(root, "absent"), undefined);
});

test("text extraction includes nested text and CDATA but excludes comments and instructions", () => {
  const root = readXml(
    "<root>A<child>B<![CDATA[C]]></child><!--ignored--><?plugin ignored?>D</root>",
  ).root;
  assert.equal(getText(root), "ABCD");
  setText(root, "replacement");
  assert.deepEqual(root.children, [{ type: "text", value: "replacement" }]);
  setText(root, "");
  assert.deepEqual(root.children, []);
});

test("element construction copies attributes including prototype-like names", () => {
  const attributes: Record<string, string> = JSON.parse(
    '{"id":"first","__proto__":"literal"}',
  );
  const element = createElement("item", attributes);
  attributes.id = "changed";
  assert.equal(element.attributes.id, "first");
  assert.equal(
    Object.getOwnPropertyDescriptor(element.attributes, "__proto__")?.value,
    "literal",
  );
  assert.deepEqual(element.children, []);
});

test("the XML depth limit accepts 512 levels and rejects level 513 on read and write", () => {
  const nested = (depth: number) => "<x>".repeat(depth) + "</x>".repeat(depth);
  const document = readXml(nested(512));
  assert.equal(getText(document.root), "");
  assert.doesNotThrow(() => writeXml(document));
  assert.throws(() => readXml(nested(513)), errorCode("INVALID_XML"));
  const root = createElement("root", {}, [document.root]);
  assert.throws(() => getText(root), errorCode("INVALID_EDIT"));
  assert.throws(
    () => writeXml({ before: [], root, after: [] }),
    errorCode("INVALID_EDIT"),
  );
});

test("shared acyclic XML subtrees can occur more than once", () => {
  const child = createElement("child", {}, [{ type: "text", value: "text" }]);
  const root = createElement("root", {}, [child, child]);
  assert.equal(getText(root), "texttext");
  assert.equal(
    writeXml({ before: [], root, after: [] }),
    "<root><child>text</child><child>text</child></root>",
  );
});

test("invalid runtime XML shapes report INVALID_EDIT", () => {
  for (const document of [
    {
      declaration: { version: "1.1" },
      before: [],
      root: createElement("root"),
      after: [],
    },
    {
      before: [],
      root: {
        type: "element",
        name: "root",
        attributes: { value: 42 },
        children: [],
      },
      after: [],
    },
    { before: [], root: { type: "unknown" }, after: [] },
  ]) {
    assert.throws(
      () => Reflect.apply(writeXml, undefined, [document]),
      errorCode("INVALID_EDIT"),
    );
  }
});

test("rejects cyclic and excessively deep edited trees", () => {
  const project = readXml('<qgis version="3.40"/>');
  project.root.children.push(project.root);
  assert.throws(() => writeXml(project), errorCode("INVALID_EDIT"));
  assert.throws(() => getText(project.root), errorCode("INVALID_EDIT"));
  const nested =
    '<qgis version="3.40">' +
    "<x>".repeat(513) +
    "</x>".repeat(513) +
    "</qgis>";
  assert.throws(() => readXml(nested), errorCode("INVALID_XML"));
});

for (const mutate of [
  (p: ReturnType<typeof readXml>) => {
    p.root.children.push(createElement("x/><injected"));
  },
  (p: ReturnType<typeof readXml>) => {
    p.root.attributes['a="value" injected'] = "oops";
  },
  (p: ReturnType<typeof readXml>) => {
    p.root.children.push({ type: "comment", value: "a--b" });
  },
  (p: ReturnType<typeof readXml>) => {
    p.root.children.push({ type: "comment", value: "a-" });
  },
  (p: ReturnType<typeof readXml>) => {
    p.root.children.push({ type: "instruction", target: "x", body: "?>" });
  },
  (p: ReturnType<typeof readXml>) => {
    p.root.children.push({ type: "text", value: "\u0001" });
  },
  (p: ReturnType<typeof readXml>) => {
    p.root.children.push(createElement("missing:namespace"));
  },
]) {
  test("rejects invalid edits before returning XML", () => {
    const project = readXml(sample);
    mutate(project);
    assert.throws(() => writeXml(project), errorCode("INVALID_EDIT"));
  });
}
