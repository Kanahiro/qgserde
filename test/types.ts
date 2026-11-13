import type {
  QgsField,
  QgsMapLayer,
  QgsProject,
  QgsVectorLayer,
} from "../src/index.ts";

/** Compile-time assertions. This function is intentionally never executed. */
export function checkPublicTypes(
  project: QgsProject,
  layer: QgsMapLayer,
): void {
  // @ts-expect-error The public model is not an arbitrary XML tree.
  project.root;
  // @ts-expect-error Titles must be strings.
  project.title = 10;
  // @ts-expect-error CRS uses explicit named fields.
  project.crs = "EPSG:4326";
  // @ts-expect-error Coordinates are numeric.
  project.extent = { xmin: "1", ymin: 0, xmax: 1, ymax: 1 };
  // @ts-expect-error Vector fields require narrowing the layer type.
  layer.fields;
  // @ts-expect-error Opacity is numeric.
  layer.opacity = "0.5";
  // @ts-expect-error A vector layer must include its field configurations.
  const invalid: QgsVectorLayer = {
    type: "vector",
    id: "id",
    name: "name",
    source: "",
    provider: "memory",
  };
  void invalid;
  if (layer.type === "vector") {
    const fields: QgsField[] = layer.fields;
    void fields;
    // @ts-expect-error Raster band settings do not belong to vector renderers.
    layer.renderer!.redBand;
  }
  if (layer.type === "raster") {
    const band: number | undefined = layer.renderer?.redBand;
    void band;
    // @ts-expect-error Raster layers do not have vector field configurations.
    layer.fields;
  }
}
