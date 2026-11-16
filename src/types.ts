import type { QgsExtensions } from "./extensions.ts";

/** Values stay strings: coercing IDs, expressions, or coordinates loses information. */
export interface XmlElement {
  type: "element";
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
}

export interface XmlText {
  type: "text";
  value: string;
}

export interface XmlCdata {
  type: "cdata";
  value: string;
}

export interface XmlComment {
  type: "comment";
  value: string;
}

export interface XmlProcessingInstruction {
  type: "instruction";
  target: string;
  body: string;
}

export interface XmlDoctype {
  type: "doctype";
  value: string;
}

export interface XmlDeclaration {
  version: "1.0";
  encoding?: string;
  standalone?: "yes" | "no";
}

export type XmlNode =
  | XmlElement
  | XmlText
  | XmlCdata
  | XmlComment
  | XmlProcessingInstruction;

export type XmlMisc = XmlText | XmlComment | XmlProcessingInstruction;

/** Low-level XML representation, independent of the public QGIS model. */
export interface XmlDocument {
  declaration?: XmlDeclaration;
  before: (XmlMisc | XmlDoctype)[];
  root: XmlElement;
  after: XmlMisc[];
}

/**
 * An editable project model, independent of the QGIS version used to read it.
 *
 * Edit the typed properties and choose a target version with {@link serializeQgs}.
 * Store it with {@link serializeJson} and restore it with {@link parseJson}.
 */
export interface QgsProject {
  /** Project title. Edits synchronize the title locations used by QGIS. */
  title: string;
  /** Project layers. Additions and removals update tree and drawing-order references on serialization. */
  layers: QgsMapLayer[];
  /** Descriptive metadata, excluding the project title. */
  metadata: QgsProjectMetadata;
  /** Horizontal CRS. Removing an active CRS disables project projection. */
  crs?: QgsCrs;
  /** Stored horizontal CRS while project projection is disabled. An active `crs` takes precedence. */
  disabledCrs?: QgsCrs;
  /** Vertical CRS, for use with QGIS versions that support it. */
  verticalCrs?: QgsCrs;
  /** Project home path, passed to QGIS without rewriting file paths. */
  homePath?: string;
  /** Default view extent, with an optional CRS of its own. */
  extent?: QgsReferencedRectangle;
  /** Default clockwise view rotation in degrees. Must be finite. */
  rotation?: number;
  /** Independent legacy map canvas settings, when different from the default view. */
  legacyView?: {
    /** Legacy canvas extent and its CRS. */
    extent?: QgsReferencedRectangle;
    /** Legacy clockwise rotation in degrees. */
    rotation?: number;
  };
  /** Groups and layer references in display order. */
  layerTree?: QgsLayerTreeGroup;
  /** Drawing order as layer IDs. Removed project layers are excluded on serialization. */
  layerOrder?: string[];
  /** @internal Unmodeled values and ordering slots; never an original XML document. */
  readonly extensions?: QgsExtensions;
}

/**
 * CRS identifier and definition. An authority ID alone is sufficient.
 *
 * To change the definition, replace the whole object, for example with
 * `{ authId: "EPSG:3857" }`, so old WKT or PROJ values are not carried over.
 */
export interface QgsCrs {
  /** Authority ID, such as `EPSG:4326`. */
  authId?: string;
  /** CRS definition in Well-Known Text. */
  wkt?: string;
  /** CRS definition as a PROJ string. */
  proj4?: string;
  /** CRS description or display name. */
  description?: string;
  /** QGIS internal CRS ID from the input. Optional when assigning an authority ID. */
  srsId?: number;
  /** Spatial reference ID from the input. */
  srid?: number;
  /** QGIS flag indicating whether this is a geographic CRS. */
  geographic?: boolean;
  /** QGIS projection acronym. */
  projectionAcronym?: string;
  /** QGIS ellipsoid acronym. */
  ellipsoidAcronym?: string;
  /** QGIS attribute identifying the source CRS definition format. */
  nativeFormat?: string;
}

/** Rectangle in CRS coordinate units. All coordinates must be finite. */
export interface QgsRectangle {
  /** Minimum x coordinate. */
  xmin: number;
  /** Minimum y coordinate. */
  ymin: number;
  /** Maximum x coordinate. */
  xmax: number;
  /** Maximum y coordinate. */
  ymax: number;
}

/** View extent with an optional CRS. Coordinates are not reprojected. */
export interface QgsReferencedRectangle extends QgsRectangle {
  /** Extent CRS. An extent without one uses the project CRS on serialization. */
  crs?: QgsCrs;
}

/** Descriptive metadata. The title is stored in {@link QgsProject.title}. */
export interface QgsProjectMetadata {
  /** Project metadata identifier. */
  identifier?: string;
  /** Identifier of the parent resource. */
  parentIdentifier?: string;
  /** Metadata language code. */
  language?: string;
  /** Resource type. */
  type?: string;
  /** Project abstract. */
  abstract?: string;
  /** Author name. */
  author?: string;
  /** Creation date and time as stored. No Date conversion or timezone adjustment is performed. */
  creationDateTime?: string;
}

/** Tree check state. `partial` means that only some children are checked. */
export type QgsCheckState = "checked" | "unchecked" | "partial";

/** Group of layers and child groups in display order. Also used for the root. */
export interface QgsLayerTreeGroup {
  /** Discriminant for a group node. */
  type: "group";
  /** Group display name. */
  name: string;
  /** Whether the node is expanded in the layer tree. */
  expanded: boolean;
  /** Group check state. */
  checked: QgsCheckState;
  /** Children in display order. A layer may be referenced more than once. */
  children: QgsLayerTreeNode[];
  /** Custom drawing order, independent of the tree order. */
  customOrder?: {
    /** Whether custom drawing order is enabled. */
    enabled: boolean;
    /** Layer IDs in custom drawing order. */
    layerIds: string[];
  };
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Tree node referencing a project layer by ID. */
export interface QgsLayerTreeLayer {
  /** Discriminant for a layer reference. */
  type: "layer";
  /** Referenced {@link QgsMapLayerBase.id}. */
  layerId: string;
  /** Tree display name, including references to external layers. */
  name?: string;
  /** Tree connection URI, which may include provider-generated UIDs. */
  source?: string;
  /** Tree connection provider identifier. */
  provider?: string;
  /** Whether the node is expanded in the layer tree. */
  expanded: boolean;
  /** Layer reference check state. Parent group states also affect visibility. */
  checked: QgsCheckState;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Tree node discriminated by `type`: a group or a layer reference. */
export type QgsLayerTreeNode = QgsLayerTreeGroup | QgsLayerTreeLayer;

/** Settings shared by all layer types. Edits do not modify the data source itself. */
export interface QgsMapLayerBase {
  /** Unique ID with at least 11 UTF-16 code units. Shorter IDs are rejected on serialization, including when read from XML. */
  id: string;
  /** Layer name. Edits also update matching tree references. */
  name: string;
  /** Provider connection string or URI. Source availability is not checked and paths are not rewritten. */
  source: string;
  /** QGIS provider identifier, such as `ogr`, `gdal`, `memory`, or `wms`. */
  provider: string;
  /** Provider character encoding. */
  providerEncoding?: string;
  /** Layer CRS. Assigning it does not transform geographic data. */
  crs?: QgsCrs;
  /** Layer extent in its CRS coordinate units. */
  extent?: QgsRectangle;
  /** Layer opacity: 0 is transparent and 1 is opaque in QGIS. */
  opacity?: number;
  /** QGIS `minScale` denominator. Applied when `scaleBasedVisibility` is enabled. */
  minScale?: number;
  /** QGIS `maxScale` denominator. Applied when `scaleBasedVisibility` is enabled. */
  maxScale?: number;
  /** Whether scale-based visibility limits are enabled. */
  scaleBasedVisibility?: boolean;
  /** @internal Unmodeled values and ordering slots. */
  readonly extensions?: QgsExtensions;
}

/** Vector layer settings. Feature data and attribute values are not included. */
export interface QgsVectorLayer extends QgsMapLayerBase {
  /** Discriminant for a vector layer. */
  type: "vector";
  /** QGIS geometry type name, such as `Point`. */
  geometry?: string;
  /** QGIS WKB geometry type string. */
  wkbType?: string;
  /** Whether the layer is read-only in QGIS. */
  readOnly?: boolean;
  /** Whether labels are enabled. Label expressions and other details stay in extension data. */
  labelsEnabled?: boolean;
  /** Field display and input settings. Edits do not change the data source schema. */
  fields: QgsField[];
  /** Renderer and symbols. */
  renderer?: QgsVectorRenderer;
}

/** Raster layer and band display settings. */
export interface QgsRasterLayer extends QgsMapLayerBase {
  /** Discriminant for a raster layer. */
  type: "raster";
  /** Common raster renderer settings. */
  renderer?: QgsRasterRenderer;
}

/** Mesh layer. Type-specific settings stay in extension data. */
export interface QgsMeshLayer extends QgsMapLayerBase {
  /** Discriminant for a mesh layer. */
  type: "mesh";
}

/** Vector tile layer. Type-specific settings stay in extension data. */
export interface QgsVectorTileLayer extends QgsMapLayerBase {
  /** Discriminant for a vector tile layer. */
  type: "vector-tile";
}

/** Point cloud layer. Type-specific settings stay in extension data. */
export interface QgsPointCloudLayer extends QgsMapLayerBase {
  /** Discriminant for a point cloud layer. The input spelling `pointcloud` is normalized to `point-cloud`. */
  type: "point-cloud";
}

/** Plugin layer. Type-specific settings stay in extension data. */
export interface QgsPluginLayer extends QgsMapLayerBase {
  /** Discriminant for a plugin layer. */
  type: "plugin";
}

/** Annotation layer. Type-specific settings stay in extension data. */
export interface QgsAnnotationLayer extends QgsMapLayerBase {
  /** Discriminant for an annotation layer. */
  type: "annotation";
}

/** Group layer. Type-specific settings stay in extension data. */
export interface QgsGroupLayer extends QgsMapLayerBase {
  /** Discriminant for a group layer. */
  type: "group";
}

/** Tiled scene layer. Type-specific settings stay in extension data. */
export interface QgsTiledSceneLayer extends QgsMapLayerBase {
  /** Discriminant for a tiled scene layer. */
  type: "tiled-scene";
}

/** Unrecognized layer type, kept separate so known layer types can still be narrowed. */
export interface QgsUnknownLayer extends QgsMapLayerBase {
  /** Discriminant for an unrecognized layer type. */
  type: "unknown";
  /** Original XML type name, restored on serialization. */
  xmlType: string;
}

/**
 * Layer union discriminated by `type`.
 *
 * @example
 * ```ts
 * for (const layer of project.layers) {
 *   if (layer.type === "vector") layer.labelsEnabled = true;
 * }
 * ```
 */
export type QgsMapLayer =
  | QgsVectorLayer
  | QgsRasterLayer
  | QgsMeshLayer
  | QgsVectorTileLayer
  | QgsPointCloudLayer
  | QgsPluginLayer
  | QgsAnnotationLayer
  | QgsGroupLayer
  | QgsTiledSceneLayer
  | QgsUnknownLayer;

/** Vector field display and input settings, excluding field values. */
export interface QgsField {
  /** Field name in the data source. */
  name: string;
  /** QGIS editor widget type, such as `TextEdit` or `Range`. */
  editorWidgetType?: string;
  /** Display alias in QGIS. */
  alias?: string;
  /** QGIS default-value expression. Stored as a string without evaluation. */
  defaultExpression?: string;
  /** Whether the default expression also applies on update. */
  applyDefaultOnUpdate?: boolean;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/**
 * QGIS variant value stored as `<Option>` XML.
 *
 * Strings, booleans, numbers, lists, and maps map to the corresponding QGIS
 * types. An unchanged kind of value keeps its stored QGIS type, such as
 * `double` for an integral number or `color` for a string. `null` is an
 * invalid (unset) variant; values QGIS cannot represent as plain data, such as
 * CRS variants, are also read as `null` and kept as stored while they remain `null`.
 */
export type QgsVariant =
  | null
  | boolean
  | number
  | string
  | QgsVariant[]
  | QgsVariantMap;

/** String-keyed QGIS variant map. */
export interface QgsVariantMap {
  [key: string]: QgsVariant;
}

/**
 * Data-defined property, with the keys QGIS stores for it.
 *
 * `type` is 0 (invalid), 1 (static value in `val`), 2 (field name in `field`),
 * or 3 (expression in `expression`).
 */
export interface QgsDataDefinedProperty {
  /** Whether the property overrides the static setting. */
  active: boolean;
  /** QGIS property type: 0 invalid, 1 static, 2 field, 3 expression. */
  type: number;
  /** Expression for an expression-based property. */
  expression?: string;
  /** Field name for a field-based property. */
  field?: string;
  /** Value for a static property. */
  val?: QgsVariant;
  /** Optional value transformer, such as a size or color scale. */
  transformer?: QgsVariant;
  /** Other keys written by QGIS. */
  [key: string]: QgsVariant;
}

/** Data-defined properties by QGIS property name, such as `fillColor` or `size`. */
export type QgsDataDefinedProperties = Record<string, QgsDataDefinedProperty>;

/** QGIS symbol geometry type. */
export type QgsSymbolType = "marker" | "line" | "fill";

/** Marker, line, or fill symbol composed of symbol layers drawn bottom to top. */
export interface QgsSymbol {
  /** Symbol type, which must match the geometry the symbol draws. */
  type: QgsSymbolType;
  /** Symbol layers, bottom first. QGIS requires at least one. */
  layers: QgsSymbolLayer[];
  /** Symbol opacity: 0 is transparent and 1 is opaque. */
  opacity?: number;
  /** Whether features are clipped to the map extent before rendering. */
  clipToExtent?: boolean;
  /** Whether polygon rings are forced to follow the right-hand rule. */
  forceRightHandRule?: boolean;
  /** Extent buffer used when clipping features. */
  extentBuffer?: number;
  /** Render unit of {@link QgsSymbol.extentBuffer}, such as `MM` or `MapUnit`. */
  extentBufferUnit?: string;
  /** Whether the symbol is animated. */
  animated?: boolean;
  /** Animation frame rate in frames per second. */
  frameRate?: number;
  /** Whether renderers should enable symbol levels for this symbol. */
  rendererShouldUseSymbolLevels?: boolean;
  /** Symbol-level data-defined properties, such as `alpha` (opacity). */
  dataDefinedProperties?: QgsDataDefinedProperties;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/**
 * Symbol layer settings. QGIS stores layer-specific settings as a property map
 * whose keys depend on {@link QgsSymbolLayer.class}.
 *
 * @example
 * ```ts
 * const fill: QgsSymbolLayer = {
 *   class: "SimpleFill",
 *   properties: { color: "255,0,0,255", outline_width: "0.5" },
 * };
 * ```
 */
export interface QgsSymbolLayer {
  /** Symbol layer class, such as `SimpleMarker`, `SimpleLine`, or `SimpleFill`. */
  class: string;
  /** Class-specific settings. Colors are strings such as `255,0,0,255`. */
  properties: QgsVariantMap;
  /** Whether the layer is drawn. */
  enabled?: boolean;
  /** Whether the layer's color is locked against symbol color changes. */
  locked?: boolean;
  /** Rendering pass used with symbol levels. */
  pass?: number;
  /** Symbol layer ID, used by selective masking. */
  id?: string;
  /** QGIS user flags, as stored. */
  userFlags?: string;
  /** Layer-level data-defined properties, such as `fillColor`. */
  dataDefinedProperties?: QgsDataDefinedProperties;
  /** Nested symbol, such as the marker drawn along a marker line. */
  subSymbol?: QgsSymbol;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Color ramp used to assign colors to new categories or classes. */
export interface QgsColorRamp {
  /** Ramp type, such as `gradient`, `random`, `colorbrewer`, `cpt-city`, or `preset`. */
  type: string;
  /** Type-specific settings, such as `color1` and `color2` for gradients. */
  properties: QgsVariantMap;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Settings shared by all vector renderers. */
export interface QgsFeatureRendererBase {
  /** Whether symbol levels are enabled. */
  symbolLevels?: boolean;
  /** Whether to force rasterization during rendering. */
  forceRaster?: boolean;
  /** Renderer reference-scale denominator; `-1` disables it. */
  referenceScale?: number;
  /** Whether feature rendering order is enabled. */
  orderByEnabled?: boolean;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Draws every feature with one symbol. */
export interface QgsSingleSymbolRenderer extends QgsFeatureRendererBase {
  /** Discriminant, matching the QGIS renderer name. */
  type: "singleSymbol";
  /** Symbol for every feature. Without one, QGIS uses a default renderer. */
  symbol?: QgsSymbol;
}

/** Category value. A list matches any of its values; `null` is the fallback category. */
export type QgsCategoryValue =
  | string
  | number
  | boolean
  | null
  | (string | number | boolean | null)[];

/** Category of a {@link QgsCategorizedRenderer}. */
export interface QgsRendererCategory {
  /** Matched attribute value. Stored numeric and string types are kept when unchanged. */
  value: QgsCategoryValue;
  /** Category symbol. QGIS discards categories without one. */
  symbol?: QgsSymbol;
  /** Legend label. */
  label: string;
  /** Whether matching features are drawn. */
  render: boolean;
  /** Category identifier used by the legend. */
  uuid?: string;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Draws features by matching an attribute or expression to categories. */
export interface QgsCategorizedRenderer extends QgsFeatureRendererBase {
  /** Discriminant, matching the QGIS renderer name. */
  type: "categorizedSymbol";
  /** Field name or expression. */
  attribute: string;
  /** Categories in legend order. */
  categories: QgsRendererCategory[];
  /** Template symbol for new categories. */
  sourceSymbol?: QgsSymbol;
  /** Color ramp for new categories. */
  colorRamp?: QgsColorRamp;
}

/** Value range of a {@link QgsGraduatedRenderer}. */
export interface QgsRendererRange {
  /** Lower bound. */
  lower: number;
  /** Upper bound. */
  upper: number;
  /** Range symbol. QGIS discards ranges without one. */
  symbol?: QgsSymbol;
  /** Legend label. */
  label: string;
  /** Whether matching features are drawn. */
  render: boolean;
  /** Range identifier used by the legend. */
  uuid?: string;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Draws features by classifying a numeric attribute or expression into ranges. */
export interface QgsGraduatedRenderer extends QgsFeatureRendererBase {
  /** Discriminant, matching the QGIS renderer name. */
  type: "graduatedSymbol";
  /** Field name or expression. */
  attribute: string;
  /** Ranges in legend order. */
  ranges: QgsRendererRange[];
  /** `GraduatedColor` or `GraduatedSize`. */
  graduatedMethod?: string;
  /** Template symbol for new ranges. */
  sourceSymbol?: QgsSymbol;
  /** Color ramp for new ranges. */
  colorRamp?: QgsColorRamp;
}

/** Rule of a {@link QgsRuleBasedRenderer}. */
export interface QgsRendererRule {
  /** Child rules, evaluated for features matching this rule. */
  children: QgsRendererRule[];
  /** Symbol drawn for matching features. */
  symbol?: QgsSymbol;
  /** Filter expression, or `ELSE`. An empty or missing filter matches all features. */
  filter?: string;
  /** Legend label. */
  label?: string;
  /** Rule description. */
  description?: string;
  /** Smallest scale denominator (most zoomed in) at which the rule applies; 0 disables it. */
  minScaleDenominator?: number;
  /** Largest scale denominator (most zoomed out) at which the rule applies; 0 disables it. */
  maxScaleDenominator?: number;
  /** Whether the rule is enabled. Defaults to `true`. */
  active?: boolean;
  /** Rule identifier used by the legend and map themes. */
  key?: string;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Draws features with nested filter rules. */
export interface QgsRuleBasedRenderer extends QgsFeatureRendererBase {
  /** Discriminant, matching the QGIS renderer name. */
  type: "RuleRenderer";
  /** Root rule. Top-level rules are its children. */
  rootRule: QgsRendererRule;
}

/** Draws no features. */
export interface QgsNullSymbolRenderer extends QgsFeatureRendererBase {
  /** Discriminant, matching the QGIS renderer name. */
  type: "nullSymbol";
}

/** Renderer whose type-specific settings are not modeled. They stay in extension data. */
export interface QgsUnknownVectorRenderer extends QgsFeatureRendererBase {
  /** Discriminant for a renderer without type-specific modeling. */
  type: "unknown";
  /** QGIS renderer name, such as `heatmapRenderer`. */
  xmlType: string;
}

/**
 * Vector renderer union discriminated by `type`.
 *
 * @example
 * ```ts
 * if (layer.type === "vector" && layer.renderer?.type === "categorizedSymbol")
 *   for (const category of layer.renderer.categories) category.render = true;
 * ```
 */
export type QgsVectorRenderer =
  | QgsSingleSymbolRenderer
  | QgsCategorizedRenderer
  | QgsGraduatedRenderer
  | QgsRuleBasedRenderer
  | QgsNullSymbolRenderer
  | QgsUnknownVectorRenderer;

/** Common raster renderer settings. Color mapping and other details stay in extension data. */
export interface QgsRasterRenderer {
  /** QGIS renderer identifier, such as `multibandcolor`. */
  type: string;
  /** Renderer opacity: 0 is transparent and 1 is opaque in QGIS. */
  opacity?: number;
  /** Alpha band number. Special values, including unused-band markers, follow QGIS conventions. */
  alphaBand?: number;
  /** Band for a single-band renderer, usually numbered from 1. */
  band?: number;
  /** Red band, usually numbered from 1. */
  redBand?: number;
  /** Green band, usually numbered from 1. */
  greenBand?: number;
  /** Blue band, usually numbered from 1. */
  blueBand?: number;
}

/** Numeric version parts and an optional release name returned by {@link parseQgisVersion}. */
export interface QgisVersion {
  /** Major version. */
  major: number;
  /** Minor version. */
  minor: number;
  /** Patch version, defaulting to 0 when omitted in the input. */
  patch: number;
  /** Release name after the hyphen, such as `Bratislava`. */
  suffix?: string;
}

/** Initial settings for {@link createProject}. All options are optional. */
export interface CreateProjectOptions {
  /** Project title. Defaults to an empty string. */
  title?: string;
}

/** Output settings, required on each call to {@link serializeQgs}. */
export interface SerializeOptions {
  /** Target QGIS 3 or 4 version. `3.40` is normalized to `3.40.0`. */
  version: string;
}
