import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  parseJson,
  parseQgs,
  serializeJson,
  serializeQgs,
} from "../src/index.ts";
import { findChild, findChildren, readXml } from "../src/xml.ts";

const fixture = () =>
  parseQgs(
    readFileSync(
      new URL("./fixtures/qgis3-layouts.qgs", import.meta.url),
      "utf8",
    ),
  );

test("reads print layouts written by QGIS", () => {
  const layout = fixture().layouts?.[0];
  assert.equal(layout?.name, "Main layout");
  assert.equal(layout?.pages?.[0]?.type, "65638");
  assert.equal(layout?.pageSymbol?.type, "fill");
  const map = layout?.items?.find((item) => item.attributes?.id === "main map");
  assert.equal(map?.type, "65639");
  assert.equal(map?.extent?.xmax, 150);
  assert.equal(map?.crs?.authId, "EPSG:4326");
  assert.equal(map?.layers?.[0]?.name, "points");
  assert.equal(map?.grids?.[0]?.attributes?.name, "grid");
  const label = layout?.items?.find((item) => item.type === "65641");
  assert.equal(label?.attributes?.labelText, "Title [% @layout_name %]");
  const legend = layout?.items?.find((item) => item.type === "65642");
  assert.deepEqual(
    legend?.legendStyles?.map((style) => style.attributes?.name),
    ["title", "group", "subgroup", "symbol", "symbolLabel"],
  );
  const scalebar = layout?.items?.find((item) => item.type === "65646");
  assert.equal(scalebar?.fillSymbol1?.type, "fill");
  assert.equal(
    layout?.items?.find((item) => item.type === "65645")?.nodes?.length,
    2,
  );
  const table = layout?.multiFrames?.[0];
  assert.equal(table?.type, "65649");
  assert.equal(table?.columns?.[0]?.attributes?.attribute, "name");
  assert.equal(table?.frames?.length, 1);
  assert.equal(layout?.atlas?.enabled, true);
  assert.equal(layout?.customProperties?.["plugin/x"], "1");
});

test("edits layouts, reorders items, and adds new ones", () => {
  const project = fixture();
  const layout = project.layouts![0]!;
  const label = layout.items!.find((item) => item.type === "65641")!;
  label.attributes!.labelText = "Changed";
  label.format!.style!.fontSize = 30;
  layout.items!.reverse();
  layout.items!.push({
    type: "65641",
    attributes: { id: "added", labelText: "Added" },
  });
  delete layout.multiFrames![0]!.sortColumns;
  const output = serializeQgs(parseJson(serializeJson(project)), {
    version: "4.2",
  });
  const element = findChild(
    findChild(readXml(output).root, "Layouts")!,
    "Layout",
  )!;
  const items = findChildren(element, "LayoutItem");
  assert.equal(items.at(-1)?.attributes.labelText, "Added");
  const reparsed = parseQgs(output).layouts![0]!;
  const changed = reparsed.items!.find(
    (item) => item.attributes?.id === "title",
  )!;
  assert.equal(changed.attributes?.labelText, "Changed");
  assert.equal(changed.format?.style?.fontSize, 30);
  // Unmodeled children stay with their item after reordering.
  const map = reparsed.items!.find(
    (item) => item.attributes?.id === "main map",
  )!;
  assert.equal(map.atlasMap !== undefined, true);
});
