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

export const vectorAttributes = {
  type: "type",
  attribute: "attr",
  symbolLevels: "symbollevels",
  forceRaster: "forceraster",
  referenceScale: "referencescale",
} as const;

export const rasterAttributes = {
  opacity: "opacity",
  alphaBand: "alphaBand",
  band: "band",
  redBand: "redBand",
  greenBand: "greenBand",
  blueBand: "blueBand",
} as const;
