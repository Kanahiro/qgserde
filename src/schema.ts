/** Shared storage names keep decoding, encoding, and extension extraction in agreement. */
export const metadataTags = {
  identifier: "identifier",
  parentIdentifier: "parentidentifier",
  language: "language",
  type: "type",
  abstract: "abstract",
  author: "author",
  creationDateTime: "creation",
} as const;

export const crsStrings = {
  authId: "authid",
  wkt: "wkt",
  proj4: "proj4",
  description: "description",
  projectionAcronym: "projectionacronym",
  ellipsoidAcronym: "ellipsoidacronym",
} as const;

type FieldValue = readonly [
  field: string,
  type: "string" | "number" | "boolean",
  fallback?: string,
];

/**
 * Per-field settings that QGIS keeps in layer-level containers keyed by field
 * name. A record exists when any of its values is set; `fallback` fills a
 * required attribute QGIS reads as empty when missing.
 */
export const fieldRecords: readonly {
  container: string;
  tag: string;
  key: string;
  values: Record<string, FieldValue>;
  /** Older projects may list fields only here; they become typed fields. */
  defines?: true;
  /** QGIS keeps these in a map and writes them sorted by field name. */
  sorted?: true;
}[] = [
  {
    container: "aliases",
    tag: "alias",
    key: "field",
    values: { name: ["alias", "string", ""] },
    defines: true,
  },
  {
    container: "defaults",
    tag: "default",
    key: "field",
    values: {
      expression: ["defaultExpression", "string", ""],
      applyOnUpdate: ["applyDefaultOnUpdate", "boolean"],
    },
    defines: true,
  },
  {
    container: "constraints",
    tag: "constraint",
    key: "field",
    values: {
      constraints: ["constraints", "number"],
      notnull_strength: ["notNullStrength", "number"],
      unique_strength: ["uniqueStrength", "number"],
      exp_strength: ["expressionStrength", "number"],
    },
  },
  {
    container: "constraintExpressions",
    tag: "constraint",
    key: "field",
    values: {
      exp: ["constraintExpression", "string"],
      desc: ["constraintDescription", "string"],
    },
  },
  {
    container: "splitPolicies",
    tag: "policy",
    key: "field",
    values: { policy: ["splitPolicy", "string"] },
  },
  {
    container: "duplicatePolicies",
    tag: "policy",
    key: "field",
    values: { policy: ["duplicatePolicy", "string"] },
  },
  {
    container: "mergePolicies",
    tag: "policy",
    key: "field",
    values: { policy: ["mergePolicy", "string"] },
  },
  {
    container: "customComments",
    tag: "customComment",
    key: "field",
    values: { value: ["comment", "string"] },
  },
  {
    container: "editable",
    tag: "field",
    key: "name",
    sorted: true,
    values: { editable: ["editable", "boolean"] },
  },
  {
    container: "labelOnTop",
    tag: "field",
    key: "name",
    sorted: true,
    values: { labelOnTop: ["labelOnTop", "boolean"] },
  },
  {
    container: "reuseLastValue",
    tag: "field",
    key: "name",
    sorted: true,
    values: { reuseLastValue: ["reuseLastValue", "boolean"] },
  },
  {
    container: "reuseLastValuePolicy",
    tag: "field",
    key: "name",
    sorted: true,
    values: { reuseLastValuePolicy: ["reuseLastValuePolicy", "string"] },
  },
];
