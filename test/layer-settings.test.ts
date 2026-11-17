import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { QgsProject, QgsVectorLayer } from "../src/index.ts";
import {
  parseJson,
  parseQgs,
  serializeJson,
  serializeQgs,
} from "../src/index.ts";
import type { XmlElement } from "../src/types.ts";
import { findChild, findChildren, getText, readXml } from "../src/xml.ts";

const fixture = () =>
  parseQgs(
    readFileSync(
      new URL("./fixtures/qgis3-vector-settings.qgs", import.meta.url),
      "utf8",
    ),
  );

function cities(project: QgsProject): QgsVectorLayer {
  const layer = project.layers.find((item) => item.name === "cities");
  if (layer?.type !== "vector") throw new Error("Expected cities");
  return layer;
}

function citiesElement(xml: string): XmlElement {
  return findChildren(
    findChild(readXml(xml).root, "projectlayers")!,
    "maplayer",
  ).find((item) => getText(findChild(item, "layername")!) === "cities")!;
}

const plain = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (key, item) =>
      key === "extensions" ? undefined : item,
    ),
  );

test("reads field, form, and common layer settings written by QGIS", () => {
  const layer = cities(fixture());
  const pop = layer.fields.find((field) => field.name === "pop")!;
  assert.deepEqual(pop.editorWidgetConfig, {
    AllowNull: true,
    Max: 1000000,
    Min: 0,
    Step: 1,
    Style: "SpinBox",
  });
  assert.equal(pop.constraintExpression, '"pop" >= 0');
  assert.equal(pop.expressionStrength, 1);
  assert.equal(pop.splitPolicy, "GeometryRatio");
  const id = layer.fields.find((field) => field.name === "id")!;
  assert.equal(id.editable, false);
  assert.equal(id.uniqueStrength, 2);
  assert.equal(layer.form?.layout, "tablayout");
  assert.equal(layer.form?.initCodeSource, 2);
  assert.match(layer.form?.initCode ?? "", /def my_init/u);
  assert.deepEqual(
    plain(layer.form?.items)?.map(
      (item: { kind: string; attributes: { name: string } }) => [
        item.kind,
        item.attributes.name,
      ],
    ),
    [["container", "Main"]],
  );
  assert.deepEqual(
    layer.form?.items?.[0]?.children?.map((item) => item.kind),
    ["field", "container"],
  );
  assert.equal(layer.joins?.[0]?.attributes?.customPrefix, "c_");
  assert.deepEqual(layer.joins?.[0]?.fields, ["cname"]);
  assert.equal(layer.expressionFields?.[0]?.name, "pop_k");
  assert.equal(layer.conditionalStyles?.fieldStyles?.[0]?.field, "pop");
  assert.equal(
    layer.referencedLayers?.[0]?.fieldRefs?.[0]?.referencedField,
    "id",
  );
  assert.deepEqual(layer.customProperties, {
    "plugin/key": "value",
    "plugin/number": 42,
  });
  assert.equal(layer.server?.legendUrlFormat, "image/png");
  assert.equal(layer.metadata?.contacts?.[0]?.fields?.email, "a@example.com");
  assert.equal(layer.temporal?.attributes?.startField, "when");
  assert.equal(layer.elevation?.attributes?.zoffset, 10);
  assert.equal(layer.elevation?.profileLineSymbol?.type, "line");
  assert.equal(layer.attributes?.autoRefreshTime, 5000);
});

test("edits settings, keeps duplicate QGIS copies in sync, and removes lists", () => {
  const project = fixture();
  const layer = cities(project);
  const name = layer.fields.find((field) => field.name === "name")!;
  name.constraintExpression = 'length("name") > 0';
  name.duplicatePolicy = "UnsetField";
  delete name.labelOnTop;
  layer.expressionFields![0]!.expression = '"pop" / 100';
  layer.form!.items![0]!.children!.reverse();
  layer.customProperties = { only: "one" };
  delete layer.actions;
  layer.server!.shortName = "towns";
  layer.metadata!.history = ["created", "edited"];

  for (const output of [
    serializeQgs(project, { version: "3.34" }),
    serializeQgs(parseJson(serializeJson(project)), { version: "4.2" }),
  ]) {
    const element = citiesElement(output);
    const copies = findChildren(element, "expressionfields");
    assert.equal(copies.length, 2);
    for (const copy of copies)
      assert.equal(
        findChild(copy, "field")!.attributes.expression,
        '"pop" / 100',
      );
    // Removing one list from a shared container keeps the other (empty) list.
    assert.deepEqual(
      findChildren(findChild(element, "attributeactions")!, "actionsetting"),
      [],
    );
    const reparsed = cities(parseQgs(output));
    const field = reparsed.fields.find((item) => item.name === "name")!;
    assert.equal(field.constraintExpression, 'length("name") > 0');
    assert.equal(field.duplicatePolicy, "UnsetField");
    assert.equal(field.labelOnTop, undefined);
    assert.deepEqual(
      reparsed.form?.items?.[0]?.children?.map((item) => item.kind),
      ["container", "field"],
    );
    assert.deepEqual(reparsed.customProperties, { only: "one" });
    assert.equal(reparsed.server?.shortName, "towns");
    assert.deepEqual(reparsed.metadata?.history, ["created", "edited"]);
  }
});

test("custom properties use <property> before QGIS 3.20", () => {
  const project = fixture();
  const layer = cities(project);
  layer.customProperties = { list: ["a", "b"], number: 3 };
  const legacy = findChild(
    citiesElement(serializeQgs(project, { version: "3.16" })),
    "customproperties",
  )!;
  assert.equal(findChild(legacy, "Option"), undefined);
  assert.deepEqual(
    findChildren(legacy, "property").map((property) => [
      property.attributes.key,
      property.attributes.value,
      findChildren(property, "value").map(getText),
    ]),
    [
      ["list", undefined, ["a", "b"]],
      ["number", "3", []],
    ],
  );
  layer.customProperties = { nested: { a: "b" } };
  assert.throws(
    () => serializeQgs(project, { version: "3.16" }),
    /before 3.20/u,
  );
  assert.match(
    serializeQgs(project, { version: "3.20" }),
    /name="nested" type="Map"/u,
  );
});

test("reads and edits diagrams written by QGIS", () => {
  const project = parseQgs(
    readFileSync(
      new URL("./fixtures/qgis3-relations.qgs", import.meta.url),
      "utf8",
    ),
  );
  const layer = project.layers.find(
    (item) => item.type === "vector" && item.diagram,
  );
  if (layer?.type !== "vector" || !layer.diagram) throw new Error("diagram");
  assert.match(layer.diagram.renderer, /DiagramRenderer$/u);
  assert.ok(layer.diagram.attributes?.diagramType);
  const category = layer.diagram.categories![0]!;
  assert.ok(category.attributes?.width);
  assert.equal(typeof layer.diagramSettings?.attributes?.placement, "number");
  layer.diagram = {
    renderer: "LinearlyInterpolatedDiagramRenderer",
    attributes: { diagramType: "Pie" },
    categories: [
      {
        attributes: { enabled: true },
        fields: [{ field: "1", color: "#ff0000", label: "x" }],
      },
    ],
  };
  const output = serializeQgs(project, { version: "3.44" });
  const reparsed = parseQgs(output).layers.find((item) => item.id === layer.id);
  if (reparsed?.type !== "vector") throw new Error("vector");
  assert.equal(
    reparsed.diagram?.renderer,
    "LinearlyInterpolatedDiagramRenderer",
  );
  assert.equal(reparsed.diagram?.categories?.[0]?.fields?.[0]?.label, "x");
});
