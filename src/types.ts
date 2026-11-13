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

/** Version-independent domain values. Snapshots retain unmodeled XML on round trips. */
export interface QgsProject {
  title: string;
  layers: QgsMapLayer[];
  metadata: QgsProjectMetadata;
  crs?: QgsCrs;
  verticalCrs?: QgsCrs;
  homePath?: string;
  extent?: QgsReferencedRectangle;
  rotation?: number;
  layerTree?: QgsLayerTreeGroup;
  layerOrder?: string[];
  /** @internal Original document, used only to preserve unmodeled settings. */
  readonly preservedXml?: XmlDocument;
}

export interface QgsCrs {
  authId?: string;
  wkt?: string;
  proj4?: string;
  description?: string;
  srsId?: number;
  srid?: number;
  geographic?: boolean;
  projectionAcronym?: string;
  ellipsoidAcronym?: string;
  nativeFormat?: string;
}

export interface QgsRectangle {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface QgsReferencedRectangle extends QgsRectangle {
  crs?: QgsCrs;
}

export interface QgsProjectMetadata {
  identifier?: string;
  parentIdentifier?: string;
  language?: string;
  type?: string;
  abstract?: string;
  author?: string;
  creationDateTime?: string;
}

export type QgsCheckState = "checked" | "unchecked" | "partial";

export interface QgsLayerTreeGroup {
  type: "group";
  name: string;
  expanded: boolean;
  checked: QgsCheckState;
  children: QgsLayerTreeNode[];
  customOrder?: { enabled: boolean; layerIds: string[] };
  /** @internal */
  readonly preservedXml?: XmlElement;
}

export interface QgsLayerTreeLayer {
  type: "layer";
  layerId: string;
  expanded: boolean;
  checked: QgsCheckState;
  /** @internal */
  readonly preservedXml?: XmlElement;
}

export type QgsLayerTreeNode = QgsLayerTreeGroup | QgsLayerTreeLayer;

export interface QgsMapLayerBase {
  id: string;
  name: string;
  source: string;
  provider: string;
  providerEncoding?: string;
  crs?: QgsCrs;
  extent?: QgsRectangle;
  opacity?: number;
  minScale?: number;
  maxScale?: number;
  scaleBasedVisibility?: boolean;
  /** @internal Original maplayer, never the authority for modeled fields. */
  readonly preservedXml?: XmlElement;
}

export interface QgsVectorLayer extends QgsMapLayerBase {
  type: "vector";
  geometry?: string;
  wkbType?: string;
  readOnly?: boolean;
  labelsEnabled?: boolean;
  fields: QgsField[];
  renderer?: QgsVectorRenderer;
}

export interface QgsRasterLayer extends QgsMapLayerBase {
  type: "raster";
  renderer?: QgsRasterRenderer;
}

export interface QgsOtherLayer extends QgsMapLayerBase {
  type:
    | "mesh"
    | "vector-tile"
    | "point-cloud"
    | "plugin"
    | "annotation"
    | "group"
    | "tiled-scene";
}

/** An explicit fallback keeps future/plugin types from weakening the discriminated union. */
export interface QgsUnknownLayer extends QgsMapLayerBase {
  type: "unknown";
  xmlType: string;
}

export type QgsMapLayer =
  | QgsVectorLayer
  | QgsRasterLayer
  | QgsOtherLayer
  | QgsUnknownLayer;

export interface QgsField {
  name: string;
  editorWidgetType?: string;
  alias?: string;
  defaultExpression?: string;
  applyDefaultOnUpdate?: boolean;
  /** @internal */
  readonly preservedXml?: XmlElement;
}

/** Renderer-specific extra settings and symbol definitions remain in preserved XML. */
export interface QgsVectorRenderer {
  type: string;
  attribute?: string;
  symbolLevels?: boolean;
  forceRaster?: boolean;
  referenceScale?: number;
}

export interface QgsRasterRenderer {
  type: string;
  opacity?: number;
  alphaBand?: number;
  band?: number;
  redBand?: number;
  greenBand?: number;
  blueBand?: number;
}

export interface QgisVersion {
  major: number;
  minor: number;
  patch: number;
  suffix?: string;
}

export interface SerializeOptions {
  /** Target QGIS 3/4 format. Required on every write; "3.40" becomes "3.40.0". */
  version: string;
}
