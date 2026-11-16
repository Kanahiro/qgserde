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
  /**
   * Project property tree, such as `Variables`, `Measurement`, `Measure`, or
   * `WMSServiceTitle`. `SpatialRefSys/ProjectionsEnabled` follows {@link QgsProject.crs}.
   */
  properties?: QgsProjectProperties;
  /** Print layouts. */
  layouts?: QgsLayout[];
  /** Map canvas annotations (text, SVG, HTML, and form annotations). */
  annotations?: QgsCanvasAnnotation[];
  /** Items of the project's main annotation layer, drawn above all layers. */
  mainAnnotationItems?: QgsAnnotationItem[];
  /** Transaction mode, such as `Disabled`, `AutomaticGroups`, or `BufferedGroups`. */
  transactionMode?: string;
  /** Project flags joined with `|`, such as `EvaluateDefaultValuesOnProviderSide`. */
  projectFlags?: string;
  /** Relations between layers. */
  relations?: QgsRelation[];
  /** Polymorphic relations, each with attributes and field pairs. */
  polymorphicRelations?: QgsRelation[];
  /** Map themes (visibility presets). */
  mapThemes?: QgsMapTheme[];
  /** Spatial bookmarks. */
  bookmarks?: QgsBookmark[];
  /** Preferred coordinate operations between CRS pairs. */
  transformContext?: QgsCoordinateOperation[];
  /** Snapping settings. */
  snapping?: QgsSnappingSettings;
  /** Data-defined properties for QGIS Server. */
  dataDefinedServerProperties?: QgsDataDefinedProperties;
  /** Elevation shading (eye-dome lighting and hillshading) settings. */
  elevationShading?: QgsAttributes;
  /** Automatic transaction groups of older projects (`active`). */
  autoTransaction?: QgsAttributes;
  /** Provider-side default values of older projects (`active`). */
  evaluateDefaultValues?: QgsAttributes;
  /** Trusted layer metadata of older projects (`active`). */
  trust?: QgsAttributes;
  /** Map canvas units of older projects, such as `degrees` or `meters`. */
  canvasUnits?: string;
  /** Whether the project's predefined scales replace the global ones. */
  useProjectScales?: boolean;
  /** Predefined scale denominators, as stored. */
  scales?: string[];
  /** Default symbol and style database settings. */
  styleSettings?: QgsProjectStyleSettings;
  /** Temporal navigation settings. */
  timeSettings?: QgsProjectTimeSettings;
  /** Terrain settings. */
  elevationProperties?: QgsProjectElevationProperties;
  /** Coordinate and bearing display settings. */
  displaySettings?: QgsProjectDisplaySettings;
  /** GPS digitizing settings. */
  gpsSettings?: QgsProjectGpsSettings;
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

/** Data-defined and custom properties of a layout object (`<LayoutObject>`). */
export interface QgsLayoutObject {
  /** Data-defined properties, such as `PositionX` or `ItemRotation`. */
  dataDefinedProperties?: QgsDataDefinedProperties;
  /** Plugin and application properties. */
  customProperties?: QgsVariantMap;
}

/** Map grid of a layout map item. */
export interface QgsLayoutMapGrid {
  /** Settings such as `name`, `show`, `intervalX`, `intervalY`, and `gridStyle`. */
  attributes?: QgsAttributes;
  /** Grid line symbol. */
  lineSymbol?: QgsSymbol;
  /** Grid marker symbol. */
  markerSymbol?: QgsSymbol;
  /** Annotation text format. */
  format?: QgsTextFormat;
  /** Annotation font settings of older projects. */
  annotationFont?: QgsAttributes;
  /** Data-defined and custom properties. */
  layoutObject?: QgsLayoutObject;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Overview of a layout map item. */
export interface QgsLayoutMapOverview {
  /** Settings such as `name`, `show`, `frameMap`, and `inverted`. */
  attributes?: QgsAttributes;
  /** Overview frame symbol. */
  symbol?: QgsSymbol;
  /** Data-defined and custom properties. */
  layoutObject?: QgsLayoutObject;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Text style of a legend component, such as `title` or `symbolLabel`. */
export interface QgsLayoutLegendStyle {
  /** Settings such as `name`, `alignment`, and `marginTop`. */
  attributes?: QgsAttributes;
  /** Text format. */
  format?: QgsTextFormat;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/**
 * Layout item. `type` is the QGIS item type number, such as `65638` (page),
 * `65639` (map), `65640` (picture), `65641` (label), `65642` (legend),
 * `65643` (shape), `65645` (polyline), `65646` (scale bar), or `65647`
 * (frame of a multi-frame). QGIS reads only the parts its type uses.
 */
export interface QgsLayoutItem {
  /** QGIS item type number. */
  type: string;
  /** Item settings, such as `id`, `uuid`, `position`, `size`, `labelText`, or `file`. */
  attributes?: QgsAttributes;
  /** Frame color (`red`, `green`, `blue`, `alpha`). */
  frameColor?: QgsAttributes;
  /** Background color (`red`, `green`, `blue`, `alpha`). */
  backgroundColor?: QgsAttributes;
  /** Data-defined and custom properties. */
  layoutObject?: QgsLayoutObject;
  /** Shape, polyline, polygon, or page symbol. */
  symbol?: QgsSymbol;
  /** Label or scale bar text format. */
  format?: QgsTextFormat;
  /** Map extent. */
  extent?: QgsRectangle;
  /** Map CRS. */
  crs?: QgsCrs;
  /** Locked map layers, each with `source`, `provider`, `name`, and the layer `id`. */
  layers?: QgsAttributes[];
  /** Map grids. */
  grids?: QgsLayoutMapGrid[];
  /** Map overviews. */
  overviews?: QgsLayoutMapOverview[];
  /** Map atlas settings (`atlasDriven`, `scalingMode`, `margin`). */
  atlasMap?: QgsAttributes;
  /** Polyline or polygon nodes, each with `x` and `y`. */
  nodes?: QgsAttributes[];
  /** Legend text styles. */
  legendStyles?: QgsLayoutLegendStyle[];
  /** Customized legend tree; QGIS uses the project tree when absent. */
  legendTree?: Omit<QgsLegendNode, "kind" | "extensions">;
  /** Scale bar line symbol. */
  lineSymbol?: QgsSymbol;
  /** Scale bar division line symbol. */
  divisionLineSymbol?: QgsSymbol;
  /** Scale bar subdivision line symbol. */
  subdivisionLineSymbol?: QgsSymbol;
  /** Scale bar first fill symbol. */
  fillSymbol1?: QgsSymbol;
  /** Scale bar second fill symbol. */
  fillSymbol2?: QgsSymbol;
  /** Scale bar stroke color. */
  strokeColor?: QgsAttributes;
  /** Scale bar first fill color. */
  fillColor?: QgsAttributes;
  /** Scale bar second fill color. */
  fillColor2?: QgsAttributes;
  /** Map item clipping settings. */
  itemClipping?: QgsAttributes;
  /** Map atlas clipping settings. */
  atlasClipping?: QgsAttributes;
  /** Layers clipped to the atlas feature. */
  atlasClippingLayers?: string[];
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Node of a layout legend tree. */
export interface QgsLegendNode {
  /** Node kind. */
  kind: "group" | "layer";
  /** Settings such as `name`, `id`, `checked`, and `legend_exp`. */
  attributes?: QgsAttributes;
  /** Custom properties, such as legend node overrides. */
  customProperties?: QgsVariantMap;
  /** Children of a group. */
  children?: QgsLegendNode[];
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Column of a layout table. */
export interface QgsLayoutTableColumn {
  /** Settings such as `attribute`, `heading`, `width`, and `hAlignment`. */
  attributes?: QgsAttributes;
  /** Background color. */
  backgroundColor?: QgsAttributes;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Layout multi-frame, such as an attribute table (`65649`) or HTML (`65650`). */
export interface QgsLayoutMultiFrame {
  /** QGIS multi-frame type number. */
  type: string;
  /** Settings such as `uuid`, `vectorLayer`, and `maxFeatures`. */
  attributes?: QgsAttributes;
  /** Data-defined and custom properties. */
  layoutObject?: QgsLayoutObject;
  /** Frames, each with the `uuid` of a frame item. */
  frames?: QgsAttributes[];
  /** Table header text format. */
  headerFormat?: QgsTextFormat;
  /** Table content text format. */
  contentFormat?: QgsTextFormat;
  /** Displayed table columns. */
  columns?: QgsLayoutTableColumn[];
  /** Sort columns. */
  sortColumns?: QgsLayoutTableColumn[];
  /** Table cell styles by part, such as `oddRows` or `headerRow`, each with `enabled` and `cellBackgroundColor`. */
  cellStyles?: Record<string, QgsAttributes>;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Print layout. */
export interface QgsLayout {
  /** Layout name. */
  name: string;
  /** Other settings, such as `units` and `printResolution`. */
  attributes?: QgsAttributes;
  /** Snapping settings. */
  snapper?: QgsAttributes;
  /** Grid settings. */
  grid?: QgsAttributes;
  /** Pages, as layout items of type `65638`. */
  pages?: QgsLayoutItem[];
  /** Default page symbol. */
  pageSymbol?: QgsSymbol;
  /** Guides, each with attributes. */
  guides?: QgsAttributes[];
  /** Items, excluding pages. */
  items?: QgsLayoutItem[];
  /** Multi-frames. */
  multiFrames?: QgsLayoutMultiFrame[];
  /** Atlas settings, such as `enabled`, `coverageLayer`, and `filenamePattern`. */
  atlas?: QgsAttributes;
  /** Plugin and application properties. */
  customProperties?: QgsVariantMap;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Map canvas annotation. */
export interface QgsCanvasAnnotation {
  /** Annotation kind. */
  kind: "text" | "svg" | "html" | "form";
  /** Content settings, such as `document` (text), `file` (SVG), or `htmlfile`. */
  attributes?: QgsAttributes;
  /** Placement and frame. */
  item?: QgsCanvasAnnotationItem;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Placement and frame of a map canvas annotation (`<AnnotationItem>`). */
export interface QgsCanvasAnnotationItem {
  /** Settings such as `mapPosX`, `mapPosY`, `visible`, and `frameWidthMM`. */
  attributes?: QgsAttributes;
  /** CRS of the map position. */
  crs?: QgsCrs;
  /** Marker symbol at the anchor point. */
  markerSymbol?: QgsSymbol;
  /** Frame fill symbol. */
  fillSymbol?: QgsSymbol;
}

/** Typed value in the project property tree. */
export type QgsProjectPropertyValue = string | number | boolean | string[];

/** Project property tree: nested keys holding typed values. */
export interface QgsProjectProperties {
  [key: string]: QgsProjectPropertyValue | QgsProjectProperties;
}

/** Legend nodes of one layer in a map theme. */
export interface QgsMapThemeLegendNodes {
  /** Layer ID. */
  layerId?: string;
  /** Legend node keys. */
  nodes?: string[];
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Map theme: layer visibility, styles, and tree state. */
export interface QgsMapTheme {
  /** Theme name. */
  name: string;
  /** Other theme attributes, such as `has-expanded-info`. */
  attributes?: QgsAttributes;
  /** Visible layers, each with `id`, `visible`, `style`, and `expanded`. */
  layers?: QgsAttributes[];
  /** Checked legend nodes by layer. */
  checkedLegendNodes?: QgsMapThemeLegendNodes[];
  /** Expanded legend nodes by layer. */
  expandedLegendNodes?: QgsMapThemeLegendNodes[];
  /** Checked group names. */
  checkedGroupNodes?: string[];
  /** Expanded group names. */
  expandedGroupNodes?: string[];
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Spatial bookmark. */
export interface QgsBookmark {
  /** Settings such as `id`, `name`, `group`, `extent` (WKT), and `rotation`. */
  attributes?: QgsAttributes;
  /** Extent CRS. */
  crs?: QgsCrs;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Preferred coordinate operation between two CRS. */
export interface QgsCoordinateOperation {
  /** Settings such as `coordinateOp` (PROJ pipeline) and `allowFallback`. */
  attributes?: QgsAttributes;
  /** Source CRS. */
  source?: QgsCrs;
  /** Destination CRS. */
  destination?: QgsCrs;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Snapping settings. */
export interface QgsSnappingSettings {
  /** Settings such as `enabled`, `mode`, `type`, `tolerance`, and `unit`. */
  attributes?: QgsAttributes;
  /** Per-layer settings, each with `id`, `enabled`, `type`, `tolerance`, and `units`. */
  layers?: QgsAttributes[];
}

/** Default symbol and style database settings. */
export interface QgsProjectStyleSettings {
  /** Settings such as `DefaultSymbolOpacity` and `RandomizeDefaultSymbolColor`. */
  attributes?: QgsAttributes;
  /** Style database paths. */
  databases?: string[];
}

/** Temporal navigation settings. */
export interface QgsProjectTimeSettings {
  /** Settings such as `timeStep`, `timeStepUnit`, and `frameRate`. */
  attributes?: QgsAttributes;
  /** Temporal range (`start`, `end`) in ISO 8601. */
  range?: QgsAttributes;
}

/** Terrain settings. */
export interface QgsProjectElevationProperties {
  /** Other elevation settings. */
  attributes?: QgsAttributes;
  /** Terrain provider type, such as `flat`, `raster`, or `mesh`. */
  terrainProviderType?: string;
  /** Terrain provider settings, such as `offset`, `scale`, and `layer`. */
  terrainProvider?: QgsAttributes;
}

/** Numeric format, such as a bearing or coordinate format. */
export interface QgsNumericFormat {
  /** Format ID, such as `basic`, `bearing`, or `geographiccoordinate`. */
  id?: string;
  /** Format settings. */
  settings?: QgsVariant;
}

/** Coordinate and bearing display settings. */
export interface QgsProjectDisplaySettings {
  /** Settings such as `CoordinateType` and `CoordinateAxisOrder`. */
  attributes?: QgsAttributes;
  /** Bearing format. */
  bearingFormat?: QgsNumericFormat;
  /** Geographic coordinate format. */
  geographicCoordinateFormat?: QgsNumericFormat;
  /** CRS for custom coordinate display. */
  customCrs?: QgsCrs;
}

/** GPS digitizing settings. */
export interface QgsProjectGpsSettings {
  /** Settings such as `destinationLayer` and `autoAddTrackVertices`. */
  attributes?: QgsAttributes;
  /** Timestamp fields by layer, each with attributes. */
  timeStampFields?: QgsAttributes[];
}

/** Descriptive metadata. The title is stored in {@link QgsProject.title}. */
export interface QgsProjectMetadata extends QgsMetadataBase {
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
  /** Other attributes, such as `mutually-exclusive` and `groupLayer`. */
  attributes?: QgsAttributes;
  /** Plugin and application properties stored with the node. */
  customProperties?: QgsVariantMap;
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
  /** Other attributes, such as `patch_size`, `legend_exp`, and `legend_split_behavior`. */
  attributes?: QgsAttributes;
  /** Plugin and application properties stored with the node. */
  customProperties?: QgsVariantMap;
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
  /** Other `<maplayer>` attributes, such as `autoRefreshMode`, `styleCategories`, or `simplifyDrawingTol`. */
  attributes?: QgsAttributes;
  /** Layer extent in WGS 84, as stored by QGIS. */
  wgs84Extent?: QgsRectangle;
  /** Named style variants. Their contents are kept but not modeled. */
  styles?: QgsLayerStyles;
  /** 3D renderer type and settings; nested 3D symbols stay in extension data. */
  renderer3d?: QgsRenderer3d;
  /** Layer flags (`<flags>`): `Identifiable`, `Removable`, `Searchable`, and `Private`, as `1` or `0`. */
  flags?: QgsAttributes;
  /** Plugin and application properties stored with the layer. */
  customProperties?: QgsVariantMap;
  /** QPainter composition mode used to draw the layer, as a QGIS blend mode number. */
  blendMode?: number;
  /** Map tip HTML template. */
  mapTip?: string;
  /** Whether the map tip is enabled. */
  mapTipEnabled?: boolean;
  /** Legend settings (`<legend>`), such as `type` and `showLabelLegend`. */
  legend?: QgsAttributes;
  /** Time settings (`<temporal>`). */
  temporal?: QgsTemporalProperties;
  /** Elevation and profile settings (`<elevation>`). */
  elevation?: QgsElevationProperties;
  /** Descriptive layer metadata. */
  metadata?: QgsLayerMetadata;
  /** Publishing settings used by QGIS Server and legends. */
  server?: QgsLayerServerProperties;
  /** @internal Unmodeled values and ordering slots. */
  readonly extensions?: QgsExtensions;
}

/** Named style variants of a layer (`<map-layer-style-manager>`). */
export interface QgsLayerStyles {
  /** Name of the current style. The layer's own settings are that style; QGIS does not re-apply it on load. */
  current?: string;
  /** Style variants; each keeps its stored style document. */
  variants?: QgsLayerStyleVariant[];
}

/** Style variant of a layer. */
export interface QgsLayerStyleVariant {
  /** Style name. */
  name?: string;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** 3D renderer of a layer. */
export interface QgsRenderer3d {
  /** Renderer type, such as `vector`, `rulebased`, `mesh`, or `pointcloud`. */
  type?: string;
  /** Other settings. */
  attributes?: QgsAttributes;
}

/** Layer time settings. */
export interface QgsTemporalProperties {
  /** Settings such as `enabled`, `mode`, `startField`, and `durationUnit`. */
  attributes?: QgsAttributes;
  /** Fixed range (`start`, `end`) for fixed-range modes. */
  fixedRange?: QgsAttributes;
}

/** Layer elevation and profile settings. */
export interface QgsElevationProperties {
  /** Settings such as `zoffset`, `zscale`, `clamping`, and `binding`. */
  attributes?: QgsAttributes;
  /** Elevation data-defined properties, such as `ZOffset`. */
  dataDefinedProperties?: QgsDataDefinedProperties;
  /** Symbol for line profiles. */
  profileLineSymbol?: QgsSymbol;
  /** Symbol for filled profiles. */
  profileFillSymbol?: QgsSymbol;
  /** Symbol for marker profiles. */
  profileMarkerSymbol?: QgsSymbol;
}

/** Layer publishing settings (QGIS Server short name, URLs, and keywords). */
export interface QgsLayerServerProperties {
  /** Short name used as the server layer name. */
  shortName?: string;
  /** Server title. */
  title?: string;
  /** Server abstract. */
  abstract?: string;
  /** Server keywords. */
  keywords?: string[];
  /** Data URL. */
  dataUrl?: string;
  /** Format of {@link QgsLayerServerProperties.dataUrl}. */
  dataUrlFormat?: string;
  /** Attribution text. */
  attribution?: string;
  /** Attribution link. */
  attributionUrl?: string;
  /** Legend image URL. */
  legendUrl?: string;
  /** Format of {@link QgsLayerServerProperties.legendUrl}. */
  legendUrlFormat?: string;
  /** Metadata URLs, each with attributes such as `type` and `format` and the URL in `url`. */
  metadataUrls?: QgsAttributes[];
}

/** Contact in metadata. */
export interface QgsMetadataContact {
  /** Contact fields such as `name`, `organization`, `position`, `email`, and `role`. */
  fields?: QgsAttributes;
  /** Postal addresses, each with fields such as `type`, `address`, and `city`. */
  addresses?: QgsAttributes[];
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Keywords of one vocabulary. */
export interface QgsMetadataKeywords {
  /** Vocabulary, such as `gmd:topicCategory`. */
  vocabulary?: string;
  /** Keywords. */
  keywords: string[];
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Descriptive metadata shared by layers and projects (QGIS `QgsAbstractMetadataBase`). */
export interface QgsMetadataBase {
  /** Keyword lists by vocabulary. */
  keywords?: QgsMetadataKeywords[];
  /** Contacts. */
  contacts?: QgsMetadataContact[];
  /** Links, each with `name`, `type`, `url`, and other attributes. */
  links?: QgsAttributes[];
  /** History entries. */
  history?: string[];
  /** Dates, each with `type` and `value`. */
  dates?: QgsAttributes[];
}

/** Layer metadata (`<resourceMetadata>`). */
export interface QgsLayerMetadata extends QgsMetadataBase {
  /** Identifier. */
  identifier?: string;
  /** Parent identifier. */
  parentIdentifier?: string;
  /** Language code. */
  language?: string;
  /** Resource type. */
  type?: string;
  /** Title. */
  title?: string;
  /** Abstract. */
  abstract?: string;
  /** Fees. */
  fees?: string;
  /** Character encoding. */
  encoding?: string;
  /** Rights statements. */
  rights?: string[];
  /** Licenses. */
  licenses?: string[];
  /** Access constraints, each with a `type` and the constraint text in `value`. */
  constraints?: QgsAttributes[];
  /** Metadata CRS. */
  crs?: QgsCrs;
  /** Spatial extents, each with attributes such as `crs`, `minx`, and `maxy`. */
  spatialExtents?: QgsAttributes[];
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
  /** Whether labels are drawn. */
  labelsEnabled?: boolean;
  /** Label settings. */
  labeling?: QgsVectorLabeling;
  /** Field display and input settings. Edits do not change the data source schema. */
  fields: QgsField[];
  /** Renderer and symbols. */
  renderer?: QgsVectorRenderer;
  /** Blend mode between features of this layer, as a QGIS blend mode number. */
  featureBlendMode?: number;
  /** Display expression, used for feature titles (`<previewExpression>`). */
  displayExpression?: string;
  /** Virtual fields, each with `name`, `expression`, `type`, and other attributes. */
  expressionFields?: QgsAttributes[];
  /** Joins to other layers. */
  joins?: QgsVectorJoin[];
  /** IDs of layers whose data this layer depends on. */
  dataDependencies?: string[];
  /** IDs of layers whose rendering this layer depends on. */
  layerDependencies?: string[];
  /** Feature actions. */
  actions?: QgsAction[];
  /** Default actions, each with `key` and `value`. */
  defaultActions?: QgsAttributes[];
  /** Attribute table settings. */
  attributeTable?: QgsAttributeTableConfig;
  /** Conditional formatting of the attribute table. */
  conditionalStyles?: QgsConditionalStyles;
  /** Stored expressions, each with `name`, `expression`, and `tag`. */
  storedExpressions?: QgsAttributes[];
  /** Attribute form settings. */
  form?: QgsEditForm;
  /** Relation editor widget settings by relation. */
  widgets?: QgsFormWidget[];
  /** Geometry validation and precision settings. */
  geometryOptions?: QgsGeometryOptions;
  /** Selection settings (`<selection>`), such as `mode`. */
  selection?: QgsAttributes;
  /** Layer-specific selection color: `spec` (such as `rgb`) and components from 0 to 1, or `invalid`. */
  selectionColor?: QgsAttributes;
  /** Diagram renderer. */
  diagram?: QgsDiagramRenderer;
  /** Diagram placement settings. */
  diagramSettings?: QgsDiagramSettings;
  /** Auxiliary storage settings (`<auxiliaryLayer>`). */
  auxiliaryLayer?: QgsAttributes;
  /** Relations to referenced layers, kept with the layer for portable styles. */
  referencedLayers?: QgsRelation[];
  /** Relations from referencing layers, kept with the layer for portable styles. */
  referencingLayers?: QgsRelation[];
}

/** Category of a diagram renderer (`<DiagramCategory>`). */
export interface QgsDiagramCategory {
  /** Settings such as `width`, `height`, `opacity`, `penColor`, and `sizeType`. */
  attributes?: QgsAttributes;
  /** Font settings. */
  font?: QgsAttributes;
  /** Diagram attributes, each with `field` (an expression), `color`, and `label`. */
  fields?: QgsAttributes[];
  /** Histogram axis symbol. */
  axisSymbol?: QgsSymbol;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Diagram renderer. */
export interface QgsDiagramRenderer {
  /**
   * Renderer element: `SingleCategoryDiagramRenderer`,
   * `LinearlyInterpolatedDiagramRenderer`, or `StackedDiagramRenderer`.
   */
  renderer: string;
  /** Settings such as `diagramType` (`Pie`, `Histogram`, `Text`) and interpolation bounds. */
  attributes?: QgsAttributes;
  /** Categories. */
  categories?: QgsDiagramCategory[];
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Diagram placement settings (`<DiagramLayerSettings>`). */
export interface QgsDiagramSettings {
  /** Settings such as `placement`, `dist`, `priority`, `zIndex`, and `showAll`. */
  attributes?: QgsAttributes;
  /** Diagram data-defined properties. */
  dataDefinedProperties?: QgsDataDefinedProperties;
}

/** Join to another vector layer. */
export interface QgsVectorJoin {
  /** Join settings, such as `joinLayerId`, `joinFieldName`, `targetFieldName`, and `customPrefix`. */
  attributes?: QgsAttributes;
  /** Joined field names; all fields when absent. */
  fields?: string[];
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Feature action. */
export interface QgsAction {
  /** Action settings, such as `name`, `type`, `action`, and `capture`. */
  attributes?: QgsAttributes;
  /** Scopes where the action is shown, such as `Feature` or `Canvas`. */
  scopes?: string[];
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Attribute table settings. */
export interface QgsAttributeTableConfig {
  /** Settings such as `sortExpression`, `sortOrder`, and `actionWidgetStyle`. */
  attributes?: QgsAttributes;
  /** Columns, each with `type`, `name`, `width`, and `hidden`. */
  columns?: QgsAttributes[];
}

/** Conditional formatting rule. */
export interface QgsConditionalStyle {
  /** Rule and colors, such as `rule`, `name`, `background_color`, and `text_color`. */
  attributes?: QgsAttributes;
  /** Font settings. */
  font?: QgsAttributes;
  /** Icon symbol. */
  symbol?: QgsSymbol;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Conditional formatting rules for one field. */
export interface QgsFieldConditionalStyles {
  /** Field name. */
  field: string;
  /** Rules. */
  styles: QgsConditionalStyle[];
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Conditional formatting of the attribute table. */
export interface QgsConditionalStyles {
  /** Rules applied to whole rows. */
  rowStyles?: QgsConditionalStyle[];
  /** Rules applied to single fields. */
  fieldStyles?: QgsFieldConditionalStyles[];
}

/** Label appearance of a form item. */
export interface QgsFormLabelStyle {
  /** Settings such as `labelColor`, `overrideLabelColor`, and `overrideLabelFont`. */
  attributes?: QgsAttributes;
  /** Font settings. */
  font?: QgsAttributes;
}

/** Item of a drag-and-drop attribute form. */
export interface QgsFormNode {
  /** Item kind: `container`, `field`, `relation`, `action`, `qml`, `html`, `text`, or `spacer`. */
  kind:
    | "container"
    | "field"
    | "relation"
    | "action"
    | "qml"
    | "html"
    | "text"
    | "spacer";
  /** Item settings, such as `name`, `showLabel`, or a container's `type` and `columnCount`. */
  attributes?: QgsAttributes;
  /** Label appearance. */
  labelStyle?: QgsFormLabelStyle;
  /** Items of a container. */
  children?: QgsFormNode[];
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Attribute form settings. */
export interface QgsEditForm {
  /** Form layout: `generatedlayout`, `tablayout`, or `uifilelayout`. */
  layout?: string;
  /** Path to a Qt Designer form for `uifilelayout`. */
  uiFile?: string;
  /** Python init function name. */
  initFunction?: string;
  /** Python init code source: 0 none, 1 file, 2 dialog, 3 environment. */
  initCodeSource?: number;
  /** Python init file path. */
  initFilePath?: string;
  /** Python init code. */
  initCode?: string;
  /** Form suppression: 0 default, 1 suppress, 2 show. */
  suppress?: number;
  /** Root label appearance of a drag-and-drop form. */
  labelStyle?: QgsFormLabelStyle;
  /** Items of a drag-and-drop form. */
  items?: QgsFormNode[];
}

/** Relation editor widget settings (`<widget>`). */
export interface QgsFormWidget {
  /** Relation ID. */
  name: string;
  /** Widget settings. */
  config?: QgsVariant;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Geometry validation and precision settings. */
export interface QgsGeometryOptions {
  /** Settings such as `geometryPrecision` and `removeDuplicateNodes`. */
  attributes?: QgsAttributes;
  /** Active geometry checks. */
  activeChecks?: QgsVariant;
  /** Geometry check settings. */
  checkConfiguration?: QgsVariant;
}

/** Relation between a referencing (child) and a referenced (parent) layer. */
export interface QgsRelation {
  /** Settings such as `id`, `name`, `referencingLayer`, `referencedLayer`, and `strength`. */
  attributes?: QgsAttributes;
  /** Field pairs, each with `referencingField` and `referencedField`. */
  fieldRefs?: QgsAttributes[];
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Raster layer and band display settings. */
export interface QgsRasterLayer extends QgsMapLayerBase {
  /** Discriminant for a raster layer. */
  type: "raster";
  /** Renderer and its type-specific settings. */
  renderer?: QgsRasterRenderer;
  /** Brightness, contrast, and gamma (`<brightnesscontrast>`). */
  brightnessContrast?: QgsAttributes;
  /** Saturation, grayscale, colorize, and inversion (`<huesaturation>`). */
  hueSaturation?: QgsAttributes;
  /** Resampling filter settings (`<rasterresampler>`), such as `zoomedInResampler`. */
  resampler?: QgsAttributes;
  /** Pipe stage that resamples: `resamplingFilter` or `provider`. */
  resamplingStage?: string;
  /** Provider resampling settings (`<provider><resampling>`). */
  providerResampling?: QgsAttributes;
  /** User no-data values per band. */
  noData?: QgsRasterNoData[];
  /** Data-defined properties of the raster pipe. */
  pipeDataDefinedProperties?: QgsDataDefinedProperties;
}

/** Mesh layer. */
export interface QgsMeshLayer extends QgsMapLayerBase {
  /** Discriminant for a mesh layer. */
  type: "mesh";
  /** Mesh rendering settings. */
  renderer?: QgsMeshRendererSettings;
  /** Active static datasets (`scalar`, `vector`). */
  staticActiveDataset?: QgsAttributes;
  /** Mesh simplification settings. */
  simplify?: QgsAttributes;
  /** Dataset groups. */
  datasetGroups?: QgsMeshDatasetGroups;
}

/** Scalar dataset rendering of a mesh dataset group. */
export interface QgsMeshScalarSettings {
  /** Settings such as `group`, `min-val`, `max-val`, `opacity`, and `interpolation-method`. */
  attributes?: QgsAttributes;
  /** Color ramp shader. */
  shader?: QgsColorRampShader;
  /** Edge settings, such as `stroke-width-unit`. */
  edge?: QgsAttributes;
  /** Edge stroke width settings. */
  edgeStrokeWidth?: QgsAttributes;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Vector dataset rendering of a mesh dataset group. */
export interface QgsMeshVectorSettings {
  /** Settings such as `group`, `symbology`, and `color`. */
  attributes?: QgsAttributes;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Mesh rendering settings. */
export interface QgsMeshRendererSettings {
  /** Active dataset groups (`scalar`, `vector`). */
  activeDatasetGroup?: QgsAttributes;
  /** Scalar rendering per dataset group. */
  scalarSettings?: QgsMeshScalarSettings[];
  /** Vector rendering per dataset group. */
  vectorSettings?: QgsMeshVectorSettings[];
  /** Native mesh frame, such as `enabled`, `color`, and `line-width`. */
  nativeMesh?: QgsAttributes;
  /** Triangular mesh frame. */
  triangularMesh?: QgsAttributes;
  /** Edge mesh frame. */
  edgeMesh?: QgsAttributes;
  /** 3D averaging method. */
  averaging?: QgsAttributes;
  /** Sigma averaging settings. */
  averagingSigma?: QgsAttributes;
}

/** Item of the mesh dataset group tree. */
export interface QgsMeshDatasetGroupItem {
  /** Settings such as `display-name`, `is-enabled`, and `dataset-index`. */
  attributes?: QgsAttributes;
  /** Child items. */
  children?: QgsMeshDatasetGroupItem[];
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Mesh dataset groups and their sources. */
export interface QgsMeshDatasetGroups {
  /** Dataset group tree. */
  tree?: QgsMeshDatasetGroupItem[];
  /** Dataset sources, each with `source-type`, `source-index`, and `global-index`. */
  datasets?: QgsAttributes[];
  /** Group names by global index. */
  nameToGlobalIndex?: QgsAttributes[];
}

/** Vector tile layer. */
export interface QgsVectorTileLayer extends QgsMapLayerBase {
  /** Discriminant for a vector tile layer. */
  type: "vector-tile";
  /** Tile styles. A basic renderer is added for new layers without one. */
  renderer?: QgsVectorTileRenderer;
  /** Tile labeling. */
  labeling?: QgsVectorTileLabeling;
}

/** Style of a vector tile renderer. */
export interface QgsVectorTileStyle {
  /** Settings such as `name`, `layer`, `geometry`, `enabled`, `min-zoom`, `max-zoom`, and `expression`. */
  attributes?: QgsAttributes;
  /** Symbol. */
  symbol?: QgsSymbol;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Vector tile renderer discriminated by `type`. */
export type QgsVectorTileRenderer =
  | {
      /** Basic renderer. */
      type: "basic";
      /** Styles in drawing order. */
      styles: QgsVectorTileStyle[];
      /** @internal */
      readonly extensions?: QgsExtensions;
    }
  | QgsUnknownLabeling;

/** Labeling style of a vector tile layer. */
export interface QgsVectorTileLabelStyle {
  /** Settings such as `name`, `layer`, `geometry`, `min-zoom`, and `expression`. */
  attributes?: QgsAttributes;
  /** Label settings. */
  settings?: QgsLabelSettings;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Vector tile labeling discriminated by `type`. */
export type QgsVectorTileLabeling =
  | {
      /** Basic labeling. */
      type: "basic";
      /** Other settings, such as `labelsEnabled`. */
      attributes?: QgsAttributes;
      /** Styles. */
      styles: QgsVectorTileLabelStyle[];
      /** @internal */
      readonly extensions?: QgsExtensions;
    }
  | QgsUnknownLabeling;

/** Point cloud layer. */
export interface QgsPointCloudLayer extends QgsMapLayerBase {
  /** Discriminant for a point cloud layer. The input spelling `pointcloud` is normalized to `point-cloud`. */
  type: "point-cloud";
  /** Point cloud renderer. */
  renderer?: QgsPointCloudRenderer;
}

/** Point cloud renderer; QGIS reads the parts its type uses. */
export interface QgsPointCloudRenderer {
  /** Renderer type, such as `rgb`, `ramp`, `classified`, `extent`, or `single-color`. */
  type: string;
  /** Settings such as `attribute`, `pointSize`, `pointSizeUnit`, and `drawOrder2d`. */
  attributes?: QgsAttributes;
  /** Classified categories, each with `value`, `color`, `label`, and `render`. */
  categories?: QgsAttributes[];
  /** Ramp shader. */
  shader?: QgsColorRampShader;
  /** Red contrast enhancement. */
  redContrastEnhancement?: QgsAttributes;
  /** Green contrast enhancement. */
  greenContrastEnhancement?: QgsAttributes;
  /** Blue contrast enhancement. */
  blueContrastEnhancement?: QgsAttributes;
}

/** Plugin layer. Type-specific settings stay in extension data. */
export interface QgsPluginLayer extends QgsMapLayerBase {
  /** Discriminant for a plugin layer. */
  type: "plugin";
}

/** Annotation layer. */
export interface QgsAnnotationLayer extends QgsMapLayerBase {
  /** Discriminant for an annotation layer. */
  type: "annotation";
  /** Annotation items. */
  items?: QgsAnnotationItem[];
}

/** Annotation item; QGIS stores only the parts its item type uses. */
export interface QgsAnnotationItem {
  /** Settings such as `type`, `id`, `wkt`, `zIndex`, and `text`. */
  attributes?: QgsAttributes;
  /** Marker symbol. */
  markerSymbol?: QgsSymbol;
  /** Line symbol. */
  lineSymbol?: QgsSymbol;
  /** Fill symbol. */
  fillSymbol?: QgsSymbol;
  /** Text format. */
  format?: QgsTextFormat;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Group layer, which renders other layers as one. */
export interface QgsGroupLayer extends QgsMapLayerBase {
  /** Discriminant for a group layer. */
  type: "group";
  /** IDs of the child layers. */
  childLayers?: string[];
}

/** Tiled scene layer. */
export interface QgsTiledSceneLayer extends QgsMapLayerBase {
  /** Discriminant for a tiled scene layer. */
  type: "tiled-scene";
  /** Tiled scene renderer. */
  renderer?: QgsTiledSceneRenderer;
}

/** Tiled scene renderer. */
export interface QgsTiledSceneRenderer {
  /** Renderer type, such as `texture` or `wireframe`. */
  type: string;
  /** Settings such as `maximumScreenError` and `tileBorderRendering`. */
  attributes?: QgsAttributes;
  /** Fill symbol. */
  fillSymbol?: QgsSymbol;
  /** Line symbol. */
  lineSymbol?: QgsSymbol;
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
  /** Editor widget settings, such as `Min` and `Max` for `Range`. Keys depend on the widget type. */
  editorWidgetConfig?: QgsVariant;
  /** QGIS field configuration flags, such as `NoFlag` or `HideFromWms`. */
  configurationFlags?: string;
  /** Enabled constraints as a QGIS bit mask: 1 not null, 2 unique, 4 expression. */
  constraints?: number;
  /** Not-null constraint strength: 0 not set, 1 hard, 2 soft. */
  notNullStrength?: number;
  /** Unique constraint strength: 0 not set, 1 hard, 2 soft. */
  uniqueStrength?: number;
  /** Expression constraint strength: 0 not set, 1 hard, 2 soft. */
  expressionStrength?: number;
  /** Constraint expression. */
  constraintExpression?: string;
  /** Description shown when the constraint expression fails. */
  constraintDescription?: string;
  /** Behavior when a feature is split, such as `Duplicate` or `GeometryRatio`. */
  splitPolicy?: string;
  /** Behavior when a feature is duplicated, such as `Duplicate` or `UnsetField`. */
  duplicatePolicy?: string;
  /** Behavior when features are merged, such as `UnsetField` or `Sum`. */
  mergePolicy?: string;
  /** Whether the field can be edited in forms. */
  editable?: boolean;
  /** Whether the form label is placed above the widget. */
  labelOnTop?: boolean;
  /** Whether new features reuse the last entered value. */
  reuseLastValue?: boolean;
  /** Reuse-last-value policy, such as `NotAllowed` or `AllowedDefaultOn`. */
  reuseLastValuePolicy?: string;
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
  /** Paint effect applied to this symbol layer. */
  effect?: QgsPaintEffect;
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

/** Paint effect, such as a drop shadow or an effect stack. */
export interface QgsPaintEffect {
  /** Effect type, such as `effectStack`, `dropShadow`, `outerGlow`, `blur`, or `drawSource`. */
  type: string;
  /** Whether the effect is enabled. */
  enabled?: boolean;
  /** Type-specific settings, such as `blur_level` or `color`. */
  properties?: QgsVariantMap;
  /** Effects of an `effectStack`, applied in order. */
  effects?: QgsPaintEffect[];
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Settings shared by all vector renderers. */
export interface QgsFeatureRendererBase {
  /** Paint effect applied to the whole layer. */
  effect?: QgsPaintEffect;
  /** Feature rendering order, each clause with `expression`, `asc`, and `nullsFirst`. */
  orderBy?: QgsAttributes[];
  /** Renderer data-defined properties. */
  dataDefinedProperties?: QgsDataDefinedProperties;
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
  /** Classification method and its label format. */
  classificationMethod?: QgsClassificationMethod;
}

/** Classification method of a graduated renderer. */
export interface QgsClassificationMethod {
  /** Method ID, such as `EqualInterval`, `Quantile`, `Jenks`, `StdDev`, or `Pretty`. */
  id?: string;
  /** Symmetric classification settings (`enabled`, `symmetrypoint`, `astride`). */
  symmetricMode?: QgsAttributes;
  /** Range label format (`format`, `labelprecision`, `trimtrailingzeroes`). */
  labelFormat?: QgsAttributes;
  /** Method parameters. */
  parameters?: QgsVariant;
}

/** Heatmap of point density. */
export interface QgsHeatmapRenderer extends QgsFeatureRendererBase {
  /** Discriminant, matching the QGIS renderer name. */
  type: "heatmapRenderer";
  /** Settings such as `radius`, `radius_unit`, `weight_expression`, `max_value`, and `quality`. */
  attributes?: QgsAttributes;
  /** Color ramp from low to high density. */
  colorRamp?: QgsColorRamp;
}

/** Points at the same location displaced around a center. */
export interface QgsPointDisplacementRenderer extends QgsFeatureRendererBase {
  /** Discriminant, matching the QGIS renderer name. */
  type: "pointDisplacement";
  /** Settings such as `tolerance`, `placement`, `circleColor`, and `labelAttributeName`. */
  attributes?: QgsAttributes;
  /** Label font settings. */
  labelFont?: QgsAttributes;
  /** Renderer for the displaced points. */
  renderer?: QgsVectorRenderer;
  /** Symbol drawn at the center of each group. */
  centerSymbol?: QgsSymbol;
}

/** Nearby points drawn as one cluster symbol. */
export interface QgsPointClusterRenderer extends QgsFeatureRendererBase {
  /** Discriminant, matching the QGIS renderer name. */
  type: "pointCluster";
  /** Settings such as `tolerance` and `toleranceUnit`. */
  attributes?: QgsAttributes;
  /** Renderer for single points. */
  renderer?: QgsVectorRenderer;
  /** Symbol drawn for each cluster. */
  clusterSymbol?: QgsSymbol;
}

/** Fills the area outside polygons. */
export interface QgsInvertedPolygonRenderer extends QgsFeatureRendererBase {
  /** Discriminant, matching the QGIS renderer name. */
  type: "invertedPolygonRenderer";
  /** Settings such as `preprocessing`. */
  attributes?: QgsAttributes;
  /** Renderer for the inverted polygons. */
  renderer?: QgsVectorRenderer;
}

/** Merges features before drawing them. */
export interface QgsMergedFeatureRenderer extends QgsFeatureRendererBase {
  /** Discriminant, matching the QGIS renderer name. */
  type: "mergedFeatureRenderer";
  /** Other settings. */
  attributes?: QgsAttributes;
  /** Renderer for the merged features. */
  renderer?: QgsVectorRenderer;
}

/** Pseudo-3D (2.5D) extruded polygons. */
export interface Qgs25DRenderer extends QgsFeatureRendererBase {
  /** Discriminant, matching the QGIS renderer name. */
  type: "25dRenderer";
  /** Other settings. */
  attributes?: QgsAttributes;
  /** Generated symbol for the walls and roofs. */
  symbol?: QgsSymbol;
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
  | QgsHeatmapRenderer
  | QgsPointDisplacementRenderer
  | QgsPointClusterRenderer
  | QgsInvertedPolygonRenderer
  | QgsMergedFeatureRenderer
  | Qgs25DRenderer
  | QgsUnknownVectorRenderer;

/**
 * XML attributes of a QGIS settings element, by attribute name, as stored.
 *
 * QGIS reads these with its own defaults, so absent keys use QGIS defaults.
 * Booleans are usually `1`/`0`, colors `r,g,b,a`, and units names such as `MM`.
 */
export type QgsAttributes = Record<string, string>;

/** Text background shape (`<background>`). */
export interface QgsTextBackground {
  /** Shape settings, such as `shapeDraw`, `shapeType`, and `shapeFillColor`. */
  attributes?: QgsAttributes;
  /** Marker symbol for marker-type shapes. */
  markerSymbol?: QgsSymbol;
  /** Fill symbol for the shape. */
  fillSymbol?: QgsSymbol;
}

/** Text format shared by labels, annotations, and layout items (`<text-style>`). */
export interface QgsTextFormat {
  /** Font and color settings, such as `fontFamily`, `fontSize`, `fontSizeUnit`, and `textColor`. */
  style?: QgsAttributes;
  /** Font families in priority order. */
  families?: string[];
  /** Tab stops, each with attributes such as `position`. */
  tabPositions?: QgsAttributes[];
  /** Text buffer (halo), such as `bufferDraw`, `bufferSize`, and `bufferColor`. */
  buffer?: QgsAttributes;
  /** Paint effect of the buffer. */
  bufferEffect?: QgsPaintEffect;
  /** Selective masking settings, such as `maskEnabled` and `maskSize`. */
  mask?: QgsAttributes;
  /** Paint effect of the mask. */
  maskEffect?: QgsPaintEffect;
  /** Background shape. */
  background?: QgsTextBackground;
  /** Paint effect of the background shape. */
  backgroundEffect?: QgsPaintEffect;
  /** Drop shadow, such as `shadowDraw` and `shadowOffsetDist`. */
  shadow?: QgsAttributes;
  /** Text-format data-defined properties. */
  dataDefinedProperties?: QgsDataDefinedProperties;
}

/** Label callout. */
export interface QgsCallout {
  /** Callout type, such as `simple`, `manhattan`, `curved`, or `balloon`. */
  type: string;
  /** Type-specific settings, such as `enabled` and `lineSymbol`. */
  properties?: QgsVariant;
}

/** Settings for labeling features (QGIS `QgsPalLayerSettings`). */
export interface QgsLabelSettings {
  /** Field name, or an expression when {@link QgsLabelSettings.isExpression} is `true`. */
  fieldName: string;
  /** Whether {@link QgsLabelSettings.fieldName} is an expression. */
  isExpression?: boolean;
  /** Text format. */
  format: QgsTextFormat;
  /** Text substitutions, each with `match`, `replace`, `caseSensitive`, and `wholeWord`. */
  substitutions?: QgsAttributes[];
  /** Wrapping and number formatting (`<text-format>`), such as `wrapChar` and `multilineAlign`. */
  formatting?: QgsAttributes;
  /** Placement (`<placement>`), such as `placement`, `dist`, and `priority`. */
  placement?: QgsAttributes;
  /** Rendering (`<rendering>`), such as `scaleVisibility`, `obstacle`, and `zIndex`. */
  rendering?: QgsAttributes;
  /** Label data-defined properties, such as `Size` or `Color`. */
  dataDefinedProperties?: QgsDataDefinedProperties;
  /** Callout drawn between the label and its feature. */
  callout?: QgsCallout;
}

/** Rule of a {@link QgsRuleBasedLabeling}. */
export interface QgsLabelRule {
  /** Child rules. */
  children: QgsLabelRule[];
  /** Label settings for matching features. */
  settings?: QgsLabelSettings;
  /** Filter expression, or `ELSE`. */
  filter?: string;
  /** Rule description. */
  description?: string;
  /** Smallest scale denominator (most zoomed in) at which the rule applies; 0 disables it. */
  minScaleDenominator?: number;
  /** Largest scale denominator (most zoomed out) at which the rule applies; 0 disables it. */
  maxScaleDenominator?: number;
  /** Whether the rule is enabled. Defaults to `true`. */
  active?: boolean;
  /** Rule identifier. */
  key?: string;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Labels every feature with one set of settings. */
export interface QgsSimpleLabeling {
  /** Discriminant, matching the QGIS labeling type. */
  type: "simple";
  /** Label settings. */
  settings: QgsLabelSettings;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Labels features with nested filter rules. */
export interface QgsRuleBasedLabeling {
  /** Discriminant, matching the QGIS labeling type. */
  type: "rule-based";
  /** Root rule. Top-level rules are its children. */
  rootRule: QgsLabelRule;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Labeling whose settings are not modeled. They stay in extension data. */
export interface QgsUnknownLabeling {
  /** Discriminant for labeling without type-specific modeling. */
  type: "unknown";
  /** QGIS labeling type. */
  xmlType: string;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** Vector labeling discriminated by `type`. Enable it with {@link QgsVectorLayer.labelsEnabled}. */
export type QgsVectorLabeling =
  | QgsSimpleLabeling
  | QgsRuleBasedLabeling
  | QgsUnknownLabeling;

/** Color ramp shader of a pseudocolor renderer (`<colorrampshader>`). */
export interface QgsColorRampShader {
  /** Shader settings, such as `colorRampType`, `classificationMode`, `minimumValue`, and `clip`. */
  attributes?: QgsAttributes;
  /** Source color ramp used to create the items. */
  colorRamp?: QgsColorRamp;
  /** Color stops, each with `value`, `color`, `alpha`, and `label`. */
  items?: QgsAttributes[];
  /** Legend settings (`<rampLegendSettings>`). */
  legend?: QgsAttributes;
}

/** Pixel transparency of a raster renderer. */
export interface QgsRasterTransparency {
  /** Single-band ranges, each with `min`, `max`, and `percentTransparent`. */
  singleValuePixelList?: QgsAttributes[];
  /** RGB values, each with `red`, `green`, `blue`, and `percentTransparent`. */
  threeValuePixelList?: QgsAttributes[];
}

/**
 * Raster renderer and its type-specific settings. QGIS reads only the parts
 * that apply to {@link QgsRasterRenderer.type}.
 */
export interface QgsRasterRenderer {
  /** QGIS renderer identifier, such as `multibandcolor`, `singlebandgray`, `singlebandpseudocolor`, `paletted`, or `hillshade`. */
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
  /** Other renderer settings, such as `grayBand`, `gradient`, `classificationMin`, or `azimuth`. */
  attributes?: QgsAttributes;
  /** How minimum and maximum values are computed, such as `limits` and `extent`. */
  minMaxOrigin?: QgsAttributes;
  /** Single-band contrast enhancement, such as `minValue`, `maxValue`, and `algorithm`. */
  contrastEnhancement?: QgsAttributes;
  /** Red band contrast enhancement. */
  redContrastEnhancement?: QgsAttributes;
  /** Green band contrast enhancement. */
  greenContrastEnhancement?: QgsAttributes;
  /** Blue band contrast enhancement. */
  blueContrastEnhancement?: QgsAttributes;
  /** Pixel transparency. */
  transparency?: QgsRasterTransparency;
  /** Pseudocolor shader. */
  shader?: QgsColorRampShader;
  /** Paletted classes, each with `value`, `color`, `alpha`, and `label`. */
  palette?: QgsAttributes[];
  /** Source color ramp of a paletted renderer. */
  colorRamp?: QgsColorRamp;
  /** Legend settings of a single-band gray renderer. */
  legend?: QgsAttributes;
}

/** No-data values of a raster band. */
export interface QgsRasterNoData {
  /** Band number, from 1. */
  band: number;
  /** Whether the provider's own no-data value is used. */
  useSourceNoData?: boolean;
  /** Additional no-data ranges, each with `min` and `max`. */
  ranges?: QgsAttributes[];
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
