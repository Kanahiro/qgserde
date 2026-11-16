import type {
  QgsDataDefinedProperty,
  QgsField,
  QgsMapLayer,
  QgsPointCloudLayer,
  QgsProject,
  QgsSymbol,
  QgsVariant,
  QgsVectorLayer,
} from "./index.ts";
import { createProject, serializeQgs } from "./index.ts";

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
  // @ts-expect-error Creation accepts a single options object.
  createProject("title");
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
    const renderer = layer.renderer;
    // @ts-expect-error Categories require narrowing the renderer type.
    renderer?.categories;
    switch (renderer?.type) {
      case "categorizedSymbol": {
        const symbol: QgsSymbol | undefined = renderer.categories[0]?.symbol;
        void symbol;
        break;
      }
      case "graduatedSymbol":
        renderer.ranges[0]!.lower = 1;
        break;
      case "RuleRenderer":
        renderer.rootRule.children.push({ filter: "ELSE", children: [] });
        break;
      case "singleSymbol":
        renderer.symbol = {
          type: "marker",
          layers: [{ class: "SimpleMarker", properties: { size: "2" } }],
        };
        // @ts-expect-error Symbol types are limited to QGIS symbol types.
        renderer.symbol.type = "point";
        break;
      case "unknown": {
        const name: string = renderer.xmlType;
        void name;
        break;
      }
      case "pointCluster":
      case "pointDisplacement":
      case "invertedPolygonRenderer":
      case "mergedFeatureRenderer": {
        const inner: QgsMapLayer["type"] | string | undefined =
          renderer.renderer?.type;
        void inner;
        break;
      }
      case "heatmapRenderer":
      case "25dRenderer":
      case "nullSymbol":
      case undefined:
        break;
      default: {
        const exhaustive: never = renderer;
        void exhaustive;
      }
    }
    const property: QgsDataDefinedProperty = {
      active: true,
      type: 3,
      expression: '"pop" / 1000',
    };
    // @ts-expect-error Variant values are plain data.
    const invalidVariant: QgsVariant = new Map();
    void [property, invalidVariant];
  }
  if (layer.type === "raster") {
    const band: number | undefined = layer.renderer?.redBand;
    void band;
    // @ts-expect-error Raster layers do not have vector field configurations.
    layer.fields;
  }
  if (layer.type === "point-cloud") {
    const pointCloud: QgsPointCloudLayer = layer;
    const type: string | undefined = layer.renderer?.type;
    void [pointCloud, type];
  }
  if (layer.type === "plugin") {
    // @ts-expect-error Plugin layers do not expose renderer settings.
    layer.renderer;
  }
  switch (layer.type) {
    case "vector":
    case "raster":
    case "mesh":
    case "vector-tile":
    case "point-cloud":
    case "plugin":
    case "annotation":
    case "group":
    case "tiled-scene":
    case "unknown":
      break;
    default: {
      const exhaustive: never = layer;
      void exhaustive;
    }
  }
}
