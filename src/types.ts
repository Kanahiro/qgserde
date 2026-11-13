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

/** JSON-compatible data; root.attributes.version is the only version authority. */
export interface QgsProject {
  declaration?: XmlDeclaration;
  before: (XmlMisc | XmlDoctype)[];
  root: XmlElement;
  after: XmlMisc[];
}

export interface QgisVersion {
  major: number;
  minor: number;
  patch: number;
  suffix?: string;
}

export interface SerializeOptions {
  /** Defaults to the source version. "3.40" is normalized to "3.40.0". */
  version?: string;
  /**
   * strict requires a migration for numeric version changes.
   * preserve changes only the version label, retaining all existing XML content.
   * It does not promise compatibility with the target QGIS release.
   */
  versionPolicy?: "strict" | "preserve";
  /** Mutates an isolated copy; errors leave the caller's project unchanged. */
  migrate?: (
    project: QgsProject,
    versions: { from: string; to: string },
  ) => void;
}
