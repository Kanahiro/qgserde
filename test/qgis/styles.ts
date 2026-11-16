import { readFileSync } from "node:fs";
import type { QgsProject } from "../../src/index.ts";
import { parseQgs } from "../../src/index.ts";

/** The QGIS-written styles fixture with renamed style variants and a moved annotation. */
export function editStylesFixture(): QgsProject {
  const project = parseQgs(
    readFileSync(
      new URL("../fixtures/qgis3-styles.qgs", import.meta.url),
      "utf8",
    ),
  );
  const layer = project.layers[0]!;
  const blue = layer.styles?.variants?.find((item) => item.name === "blue");
  if (!blue || !layer.styles) throw new Error("Missing style variant");
  blue.name = "navy";
  layer.styles.current = "navy";
  const note = project.annotations?.[0];
  if (!note?.item?.attributes) throw new Error("Missing annotation");
  note.item.attributes.mapPosX = "5";
  return project;
}
