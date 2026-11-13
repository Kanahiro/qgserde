import type {
  QgsField,
  QgsMapLayer,
  QgsProject,
  QgsVectorLayer,
} from "../src/index.ts";
import { createProject, serializeQgs } from "../src/index.ts";

/** Compile-time assertions. This function is intentionally never executed. */
export function checkPublicTypes(
  project: QgsProject,
  layer: QgsMapLayer,
): void {
  // @ts-expect-error The public model is not an arbitrary XML tree.
  project.root;
  // @ts-expect-error Versions belong to serialization, not the domain model.
  project.version;
  createProject();
  createProject({});
  createProject({ title: "title" });
  createProject({ templateXml: '<qgis version="4.2"/>', title: "title" });
  // @ts-expect-error Creation accepts a single options object.
  createProject('<qgis version="4.2"/>');
  // @ts-expect-error Positional template/title arguments are no longer accepted.
  createProject('<qgis version="4.2"/>', "title");
  // @ts-expect-error The optional template must be an XML string.
  createProject({ templateXml: 42 });
  // @ts-expect-error The optional title must be a string.
  createProject({ title: 42 });
  const standalone: QgsProject = { title: "title", layers: [], metadata: {} };
  void standalone;
  // @ts-expect-error Models do not retain a source XML document.
  project.preservedXml;
  // @ts-expect-error The target format must be explicit on every write.
  serializeQgs(project);
  // @ts-expect-error A target version is required.
  serializeQgs(project, {});
  // @ts-expect-error Format conversion is owned by the codec.
  serializeQgs(project, { version: "4.2", migrate() {} });
  // @ts-expect-error There is no version-label-only escape hatch.
  serializeQgs(project, { version: "4.2", versionPolicy: "preserve" });
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
