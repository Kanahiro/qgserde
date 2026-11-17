import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type {
  QgsMapLayer,
  QgsProject,
  QgsRendererRule,
  QgsVectorRenderer,
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

const wrap = (renderer: string, version = "4.2.0") =>
  `<qgis version="${version}"><projectlayers><maplayer type="vector"><id>symbology_layer_01</id>${renderer}</maplayer></projectlayers></qgis>`;

function renderer(project: QgsProject): QgsVectorRenderer {
  const layer = project.layers[0]!;
  if (layer.type !== "vector" || !layer.renderer)
    throw new Error("Expected a vector renderer");
  return layer.renderer;
}

function rendererElement(xml: string): XmlElement {
  const layers = findChild(readXml(xml).root, "projectlayers")!;
  return findChild(findChild(layers, "maplayer")!, "renderer-v2")!;
}

const fill = (color: string, extra = "") =>
  `<layer class="SimpleFill" enabled="1" locked="0" pass="0"><Option type="Map"><Option name="color" type="QString" value="${color}"/></Option>${extra}</layer>`;

test("edits a real rule-based renderer and keeps its unmodeled data", () => {
  const xml = readFileSync(
    new URL("./fixtures/qgis4-translation.qgs", import.meta.url),
    "utf8",
  );
  const project = parseQgs(xml);
  const layer = project.layers.find(
    (item) => item.type === "vector" && item.renderer?.type === "RuleRenderer",
  );
  if (layer?.type !== "vector" || layer.renderer?.type !== "RuleRenderer")
    throw new Error("Expected a rule renderer");
  const [arterial, highway] = layer.renderer.rootRule.children;
  assert.equal(arterial?.filter, `"Name" = 'Arterial'`);
  assert.equal(highway?.children.length, 2);
  const line = arterial!.symbol!.layers[0]!;
  assert.equal(line.class, "SimpleLine");
  assert.equal(line.properties.line_width, "10");
  assert.match(line.id ?? "", /^\{/u);

  line.properties.line_width = "2";
  highway!.children.shift();
  highway!.label = "Highways";
  const restored = parseJson(serializeJson(project));
  const layerId: string = layer.id;
  for (const output of [
    serializeQgs(project, { version: "4.2" }),
    serializeQgs(restored, { version: "4.2" }),
  ]) {
    const reparsed = parseQgs(output);
    const edited: QgsMapLayer | undefined = reparsed.layers.find(
      (item) => item.id === layerId,
    );
    if (edited?.type !== "vector" || edited.renderer?.type !== "RuleRenderer")
      throw new Error("Expected a rule renderer");
    const rules: QgsRendererRule[] = edited.renderer.rootRule.children;
    assert.equal(rules[0]!.symbol!.layers[0]!.properties.line_width, "2");
    assert.equal(rules[1]!.label, "Highways");
    assert.deepEqual(
      rules[1]!.children.map((rule) => rule.label),
      ["High Highway purple"],
    );
    // Symbols are renumbered in pre-order and referenced consistently.
    const element = findChildren(
      findChild(readXml(output).root, "projectlayers")!,
      "maplayer",
    )
      .map((item) => findChild(item, "renderer-v2"))
      .find((item) => item?.attributes.type === "RuleRenderer")!;
    assert.deepEqual(
      findChildren(findChild(element, "symbols")!, "symbol").map(
        (symbol) => symbol.attributes.name,
      ),
      ["0", "1", "2"],
    );
    // Unmodeled symbol-layer data keeps its owner.
    assert.equal(
      findChild(findChild(findChild(element, "symbols")!, "symbol")!, "layer")!
        .attributes.id,
      line.id,
    );
  }
});

test("categories keep stored value types, symbols and unknown data through edits", () => {
  const project = parseQgs(
    wrap(
      `<renderer-v2 type="categorizedSymbol" attr="code" custom="keep"><categories><category value="1" type="double" symbol="0" label="One" render="true" uuid="a" extra="x"/><category value="9007199254740993" type="long" symbol="1" label="Big" render="false"/><category symbol="2" label="Many"><val value="1" type="long"/><val value="b" type="string"/></category><category value="NULL" type="NULL" symbol="3" label="Other" render="true"/><category value="dup" symbol="0" label="Duplicate"/></categories><symbols><symbol type="fill" name="0">${fill("1,0,0,255", "<effect/>")}</symbol><symbol type="fill" name="1">${fill("2,0,0,255")}</symbol><symbol type="fill" name="2">${fill("3,0,0,255")}</symbol><symbol type="fill" name="3">${fill("4,0,0,255")}</symbol><symbol type="bogus" name="unused"/></symbols><colorramp type="gradient" name="[source]"><Option type="Map"><Option name="color1" type="QString" value="0,0,0,255"/></Option></colorramp><custom-child/></renderer-v2>`,
    ),
  );
  const categorized = renderer(project);
  if (categorized.type !== "categorizedSymbol") throw new Error("categorized");
  assert.deepEqual(
    categorized.categories.map((category) => category.value),
    [1, "9007199254740993", [1, "b"], null, "dup"],
  );
  // QGIS gives each stored symbol to one category; the duplicate gets none.
  assert.equal(categorized.categories[4]!.symbol, undefined);
  assert.equal(categorized.categories[1]!.render, false);
  assert.deepEqual(categorized.colorRamp?.properties, {
    color1: "0,0,0,255",
  });

  // Reorder, edit, add and remove; unknown data must follow its category.
  const [one, big, many, other] = categorized.categories;
  many!.value = [1, "b", true];
  other!.value = "fallback";
  categorized.categories = [
    big!,
    one!,
    many!,
    other!,
    {
      value: 2.5,
      label: "New",
      render: true,
      symbol: {
        type: "fill",
        layers: [{ class: "SimpleFill", properties: { color: "9,9,9,255" } }],
      },
    },
  ];
  categorized.attribute = "kind";
  const output = serializeQgs(project, { version: "4.2" });
  const element = rendererElement(output);
  assert.equal(element.attributes.custom, "keep");
  assert.equal(element.attributes.attr, "kind");
  assert.ok(findChild(element, "custom-child"));
  const categories = findChildren(
    findChild(element, "categories")!,
    "category",
  );
  assert.deepEqual(
    categories.map((item) => [
      item.attributes.value,
      item.attributes.type,
      item.attributes.symbol,
      item.attributes.extra,
    ]),
    [
      ["9007199254740993", "long", "0", undefined],
      ["1", "double", "1", "x"],
      [undefined, undefined, "2", undefined],
      ["fallback", "string", "3", undefined],
      ["2.5", "double", "4", undefined],
    ],
  );
  assert.deepEqual(
    findChildren(categories[2]!, "val").map((item) => [
      item.attributes.value,
      item.attributes.type,
    ]),
    [
      ["1", "long"],
      ["b", "string"],
      ["true", "bool"],
    ],
  );
  const symbols = findChildren(findChild(element, "symbols")!, "symbol");
  assert.deepEqual(
    symbols.map((symbol) => symbol.attributes.name),
    ["0", "1", "2", "3", "4"],
  );
  // The paint effect stayed with the symbol layer of the moved category.
  assert.ok(findChild(findChild(symbols[1]!, "layer")!, "effect"));
  assert.equal(
    findChild(findChild(symbols[0]!, "layer")!, "effect"),
    undefined,
  );

  const reparsed = renderer(parseQgs(output));
  if (reparsed.type !== "categorizedSymbol") throw new Error("categorized");
  assert.deepEqual(
    reparsed.categories.map((category) => category.value),
    ["9007199254740993", 1, [1, "b", true], "fallback", 2.5],
  );
  assert.equal(serializeQgs(parseQgs(output), { version: "4.2" }), output);
});

test("symbol layer properties follow the target QGIS version", () => {
  const project = parseQgs(
    wrap(
      `<renderer-v2 type="singleSymbol"><symbols><symbol type="fill" name="0"><layer class="SimpleFill"><Option type="Map"><Option name="color" type="QString" value="1,2,3,255"/></Option><prop k="color" v="1,2,3,255"/></layer></symbol></symbols></renderer-v2>`,
      "3.22.0",
    ),
  );
  const single = renderer(project);
  if (single.type !== "singleSymbol") throw new Error("single");
  assert.deepEqual(single.symbol?.layers[0]?.properties, {
    color: "1,2,3,255",
  });
  const layerOf = (xml: string) =>
    findChild(
      findChild(findChild(rendererElement(xml), "symbols")!, "symbol")!,
      "layer",
    )!;
  const modern = layerOf(serializeQgs(project, { version: "3.22" }));
  assert.equal(findChildren(modern, "prop").length, 0);
  assert.ok(findChild(modern, "Option"));
  const legacy = layerOf(serializeQgs(project, { version: "3.16" }));
  assert.equal(findChild(legacy, "Option"), undefined);
  assert.deepEqual(findChildren(legacy, "prop")[0]?.attributes, {
    k: "color",
    v: "1,2,3,255",
  });
});

test("rules can move between root and child positions", () => {
  const project = parseQgs(
    wrap(
      `<renderer-v2 type="RuleRenderer"><rules key="root"><rule key="child" filter="a" symbol="0" checkstate="0"/></rules><symbols><symbol type="line" name="0"><layer class="SimpleLine"/></symbol></symbols></renderer-v2>`,
    ),
  );
  const rules = renderer(project);
  if (rules.type !== "RuleRenderer") throw new Error("rules");
  const child = rules.rootRule.children[0]!;
  assert.equal(child.active, false);
  const root = rules.rootRule;
  root.children = [];
  child.children = [root];
  rules.rootRule = child;
  const element = rendererElement(serializeQgs(project, { version: "4.2" }));
  const top = findChild(element, "rules")!;
  assert.equal(top.attributes.key, "child");
  assert.equal(top.attributes.symbol, "0");
  assert.equal(findChild(top, "rule")?.attributes.key, "root");
});

test("unknown renderers keep their nested renderers and symbols", () => {
  const xml = wrap(
    `<renderer-v2 type="futureCluster" tolerance="3"><renderer-v2 type="singleSymbol"><symbols><symbol type="marker" name="0"><layer class="SimpleMarker"/></symbol></symbols></renderer-v2><symbol type="marker" name="centerSymbol"><layer class="FontMarker"/></symbol></renderer-v2>`,
  );
  const project = parseQgs(xml);
  const cluster = renderer(project);
  assert.equal(cluster.type, "unknown");
  assert.equal(cluster.type === "unknown" && cluster.xmlType, "futureCluster");
  cluster.forceRaster = true;
  const element = rendererElement(serializeQgs(project, { version: "4.2" }));
  assert.equal(element.attributes.forceraster, "1");
  assert.equal(element.attributes.tolerance, "3");
  assert.ok(findChild(findChild(element, "renderer-v2")!, "symbols"));
  assert.equal(findChild(element, "symbol")?.attributes.name, "centerSymbol");
});

test("invalid symbology fails explicitly", () => {
  const edit = (change: (project: QgsProject) => void) => {
    const project = parseQgs(
      wrap(
        `<renderer-v2 type="singleSymbol"><symbols><symbol type="marker" name="0"><layer class="SimpleMarker"/></symbol></symbols></renderer-v2>`,
      ),
    );
    change(project);
    return () => serializeQgs(project, { version: "4.2" });
  };
  const symbolOf = (project: QgsProject) => {
    const single = renderer(project);
    if (single.type !== "singleSymbol" || !single.symbol)
      throw new Error("single");
    return single.symbol;
  };
  for (const change of [
    (project: QgsProject) => {
      symbolOf(project).layers = [];
    },
    (project: QgsProject) => {
      symbolOf(project).type = "polygon" as never;
    },
    (project: QgsProject) => {
      symbolOf(project).layers[0]!.class = "";
    },
    (project: QgsProject) => {
      symbolOf(project).opacity = "1" as never;
    },
    (project: QgsProject) => {
      const symbol = symbolOf(project);
      symbol.layers[0]!.subSymbol = symbol;
    },
    (project: QgsProject) => {
      symbolOf(project).layers[0]!.properties = { size: Number.NaN };
    },
  ])
    assert.throws(
      edit(change),
      (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
    );
  assert.throws(
    () =>
      parseQgs(
        wrap(
          `<renderer-v2 type="singleSymbol"><symbols><symbol type="polygon" name="0"/></symbols></renderer-v2>`,
        ),
      ),
    (error) => error instanceof QgsError && error.code === "INVALID_PROJECT",
  );
});

test("reads and edits wrapper renderers, paint effects, and order-by", () => {
  const project = parseQgs(
    readFileSync(
      new URL("./fixtures/qgis3-renderers.qgs", import.meta.url),
      "utf8",
    ),
  );
  const byName = (name: string) => {
    const layer = project.layers.find((item) => item.name === name);
    if (layer?.type !== "vector" || !layer.renderer)
      throw new Error(`Expected renderer on ${name}`);
    return layer.renderer;
  };
  const cluster = byName("cluster");
  if (cluster.type !== "pointCluster") throw new Error("cluster");
  assert.equal(cluster.attributes?.tolerance, 5);
  assert.equal(cluster.renderer?.type, "singleSymbol");
  assert.equal(cluster.clusterSymbol?.type, "marker");
  const displacement = byName("displacement");
  if (displacement.type !== "pointDisplacement") throw new Error("disp");
  assert.equal(displacement.renderer?.type, "categorizedSymbol");
  assert.match(displacement.labelFont?.description ?? "", /,12,/u);
  const heatmap = byName("heatmap");
  if (heatmap.type !== "heatmapRenderer") throw new Error("heatmap");
  assert.equal(heatmap.attributes?.radius, 15);
  assert.equal(heatmap.colorRamp?.type, "gradient");
  assert.equal(byName("inverted").type, "invertedPolygonRenderer");
  assert.equal(byName("merged").type, "mergedFeatureRenderer");
  const twofive = byName("twofive");
  if (twofive.type !== "25dRenderer") throw new Error("25d");
  assert.equal(twofive.symbol?.layers[1]?.class, "GeometryGenerator");
  const ordered = byName("ordered");
  if (ordered.type !== "singleSymbol") throw new Error("single");
  assert.deepEqual(ordered.orderBy, [
    { asc: false, nullsFirst: true, expression: '"v"' },
  ]);
  assert.deepEqual(
    ordered.effect?.effects?.map((item) => item.type),
    ["dropShadow", "drawSource"],
  );
  assert.equal(
    ordered.symbol?.layers[0]?.effect?.effects?.[0]?.type,
    "outerGlow",
  );

  // Edit nested renderers and effect stacks.
  if (cluster.renderer?.type !== "singleSymbol") throw new Error("inner");
  cluster.renderer.symbol!.layers[0]!.properties.color = "1,2,3,255";
  cluster.attributes!.tolerance = 8;
  ordered.effect!.effects!.reverse();
  delete ordered.symbol!.layers[0]!.effect;
  ordered.orderBy = [{ expression: '"v" * 2', asc: true, nullsFirst: false }];
  const output = serializeQgs(project, { version: "3.34" });
  const reparsed = parseQgs(output);
  const again = (name: string) => {
    const layer = reparsed.layers.find((item) => item.name === name);
    if (layer?.type !== "vector" || !layer.renderer) throw new Error(name);
    return layer.renderer;
  };
  const cluster2 = again("cluster");
  if (
    cluster2.type !== "pointCluster" ||
    cluster2.renderer?.type !== "singleSymbol"
  )
    throw new Error("cluster");
  assert.equal(
    cluster2.renderer.symbol?.layers[0]?.properties.color,
    "1,2,3,255",
  );
  assert.equal(cluster2.attributes?.tolerance, 8);
  const ordered2 = again("ordered");
  if (ordered2.type !== "singleSymbol") throw new Error("single");
  assert.deepEqual(
    ordered2.effect?.effects?.map((item) => item.type),
    ["drawSource", "dropShadow"],
  );
  assert.equal(ordered2.symbol?.layers[0]?.effect, undefined);
  assert.equal(ordered2.orderBy?.[0]?.expression, '"v" * 2');
});
