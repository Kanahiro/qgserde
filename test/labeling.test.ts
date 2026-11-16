import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type {
  QgsLabelSettings,
  QgsProject,
  QgsVectorLabeling,
} from "../src/index.ts";
import {
  parseJson,
  parseQgs,
  QgsError,
  serializeJson,
  serializeQgs,
} from "../src/index.ts";
import type { XmlElement } from "../src/types.ts";
import { findChild, findChildren, readXml } from "../src/xml.ts";

const fixture = () =>
  parseQgs(
    readFileSync(
      new URL("./fixtures/qgis3-labeling.qgs", import.meta.url),
      "utf8",
    ),
  );

function labelingOf(project: QgsProject, name: string): QgsVectorLabeling {
  const layer = project.layers.find((item) => item.name === name);
  if (layer?.type !== "vector" || !layer.labeling)
    throw new Error(`Expected labeling on ${name}`);
  return layer.labeling;
}

function labelingElement(xml: string, name: string): XmlElement {
  const layers = findChildren(
    findChild(readXml(xml).root, "projectlayers")!,
    "maplayer",
  );
  const layer = layers.find(
    (item) =>
      findChild(item, "layername")?.children[0]?.type === "text" &&
      (findChild(item, "layername")!.children[0] as { value: string }).value ===
        name,
  )!;
  return findChild(layer, "labeling")!;
}

test("reads simple and rule-based labeling written by QGIS", () => {
  const project = fixture();
  const simple = labelingOf(project, "simple");
  if (simple.type !== "simple") throw new Error("simple");
  const settings = simple.settings;
  assert.equal(settings.fieldName, "name");
  assert.equal(settings.isExpression, false);
  assert.equal(settings.format.style!.fontSize, "12");
  assert.equal(settings.format.style!.textColor, "10,20,30,255");
  assert.equal(settings.format.style!.fieldName, undefined);
  assert.equal(settings.format.buffer?.bufferDraw, "1");
  assert.equal(
    settings.format.background?.markerSymbol?.layers[0]?.properties.name,
    "star",
  );
  assert.equal(settings.format.background?.fillSymbol?.type, "fill");
  assert.equal(settings.placement?.placement, "1");
  assert.equal(settings.callout?.type, "simple");
  assert.deepEqual(settings.dataDefinedProperties, {
    Size: { active: true, expression: '"size" * 2', type: 3 },
  });

  const rules = labelingOf(project, "rules");
  if (rules.type !== "rule-based") throw new Error("rules");
  const [major, other] = rules.rootRule.children;
  assert.equal(major?.description, "Major");
  assert.equal(major?.maxScaleDenominator, 50000);
  assert.equal(major?.settings?.isExpression, true);
  assert.equal(major?.children[0]?.filter, '"lanes" > 2');
  assert.equal(other?.active, false);
});

test("edits labeling and keeps unmodeled data with its owner", () => {
  const project = fixture();
  const simple = labelingOf(project, "simple");
  const rules = labelingOf(project, "rules");
  if (simple.type !== "simple" || rules.type !== "rule-based")
    throw new Error("labeling");
  const settings = simple.settings;
  settings.fieldName = "\"name\" || '!'";
  settings.isExpression = true;
  settings.format.style!.fontSize = "20";
  settings.format.families = ["Noto Sans", "Arial"];
  delete settings.format.buffer;
  settings.format.background!.markerSymbol!.layers[0]!.properties.name =
    "circle";
  delete settings.format.background!.fillSymbol;
  settings.substitutions = [
    { match: "Street", replace: "St", caseSensitive: "0", wholeWord: "1" },
  ];
  delete settings.callout;
  rules.rootRule.children.reverse();
  rules.rootRule.children[1]!.children = [];

  for (const output of [
    serializeQgs(project, { version: "3.34" }),
    serializeQgs(parseJson(serializeJson(project)), { version: "4.2" }),
  ]) {
    const element = labelingElement(output, "simple");
    const settingsElement = findChild(element, "settings")!;
    const style = findChild(settingsElement, "text-style")!;
    assert.equal(style.attributes.fontSize, "20");
    assert.equal(style.attributes.isExpression, "1");
    assert.equal(findChild(style, "text-buffer"), undefined);
    assert.deepEqual(
      findChildren(findChild(style, "families")!, "family").map(
        (family) => family.attributes.name,
      ),
      ["Noto Sans", "Arial"],
    );
    const background = findChild(style, "background")!;
    assert.deepEqual(
      findChildren(background, "symbol").map(
        (symbol) => symbol.attributes.name,
      ),
      ["markerSymbol"],
    );
    assert.equal(
      findChild(findChild(style, "substitutions")!, "replacement")!.attributes
        .replace,
      "St",
    );
    assert.equal(settingsElement.attributes.calloutType, undefined);
    assert.equal(findChild(settingsElement, "callout"), undefined);

    const reparsed = labelingOf(parseQgs(output), "rules");
    if (reparsed.type !== "rule-based") throw new Error("rules");
    assert.deepEqual(
      reparsed.rootRule.children.map((rule) => [
        rule.filter,
        rule.children.length,
      ]),
      [
        ["ELSE", 0],
        ["\"class\" = 'major'", 0],
      ],
    );
    const again = parseQgs(output);
    assert.equal(
      serializeQgs(again, { version: "4.2" }),
      serializeQgs(parseQgs(serializeQgs(again, { version: "4.2" })), {
        version: "4.2",
      }),
    );
  }
});

test("creates labeling from scratch and moves rules to the root", () => {
  const project = fixture();
  const layer = project.layers.find((item) => item.name === "rules")!;
  if (layer.type !== "vector") throw new Error("vector");
  const settings: QgsLabelSettings = {
    fieldName: "class",
    format: {
      style: { fontSize: "9", textColor: "0,0,0,255" },
      shadow: { shadowDraw: "1" },
    },
    placement: { placement: "2" },
    callout: { type: "manhattan", properties: { enabled: "1" } },
  };
  layer.labeling = { type: "simple", settings };
  const element = labelingElement(
    serializeQgs(project, { version: "4.2" }),
    "rules",
  );
  assert.equal(element.attributes.type, "simple");
  const written = findChild(element, "settings")!;
  assert.equal(written.attributes.calloutType, "manhattan");
  assert.equal(findChild(written, "callout")!.attributes.type, "manhattan");
  assert.equal(
    findChild(findChild(written, "text-style")!, "shadow")!.attributes
      .shadowDraw,
    "1",
  );
  assert.equal(findChild(written, "text-style")!.attributes.fieldName, "class");

  // A child rule (stored as <rule>) can become the root (<rules>).
  const original = fixture();
  const rules = labelingOf(original, "rules");
  if (rules.type !== "rule-based") throw new Error("rules");
  const child = rules.rootRule.children[0]!;
  rules.rootRule = child;
  const top = findChild(
    labelingElement(serializeQgs(original, { version: "4.2" }), "rules"),
    "rules",
  )!;
  assert.equal(top.attributes.description, "Major");
});

test("unknown labeling types keep their settings and invalid edits fail", () => {
  const project = parseQgs(
    '<qgis version="3.40.0"><projectlayers><maplayer type="vector"><id>labels_layer_001</id><labeling type="future" mode="x"><settings custom="1"/></labeling></maplayer></projectlayers></qgis>',
  );
  const layer = project.layers[0]!;
  if (layer.type !== "vector") throw new Error("vector");
  assert.deepEqual(
    {
      type: layer.labeling?.type,
      xmlType: (layer.labeling as { xmlType?: string }).xmlType,
    },
    { type: "unknown", xmlType: "future" },
  );
  const output = serializeQgs(project, { version: "4.2" });
  assert.match(
    output,
    /<labeling type="future" mode="x"><settings custom="1"\/><\/labeling>/u,
  );
  for (const labeling of [
    { type: "other" },
    { type: "simple", settings: { fieldName: 1, format: { style: {} } } },
    {
      type: "simple",
      settings: { fieldName: "a", format: { style: { size: 1 } } },
    },
    { type: "rule-based", rootRule: { children: "none" } },
  ]) {
    layer.labeling = labeling as never;
    assert.throws(
      () => serializeQgs(project, { version: "4.2" }),
      (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
    );
  }
});
