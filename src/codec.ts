import { QgsError } from "./errors.ts";
import { crsStrings } from "./schema.ts";
import type { QgsCrs, QgsRectangle, XmlElement } from "./types.ts";
import { createElement, findChild, getText } from "./xml.ts";

export function text(parent: XmlElement, name: string): string | undefined {
  const child = findChild(parent, name);
  return child ? getText(child) : undefined;
}

export function number(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new QgsError(
      "INVALID_PROJECT",
      `Expected a finite number, received ${value}`,
    );
  return parsed;
}

export function boolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  throw new QgsError(
    "INVALID_PROJECT",
    `Expected a boolean, received ${value}`,
  );
}

export function ensure(parent: XmlElement, name: string): XmlElement {
  let child = findChild(parent, name);
  if (!child) {
    child = createElement(name);
    parent.children.push(child);
  }
  return child;
}

export function remove(parent: XmlElement, name: string): void {
  parent.children = parent.children.filter(
    (node) => node.type !== "element" || node.name !== name,
  );
}

export function putText(
  parent: XmlElement,
  name: string,
  value: string | undefined,
): void {
  if (value === undefined) {
    remove(parent, name);
    return;
  }
  if (typeof value !== "string")
    throw new QgsError("INVALID_EDIT", `${name} must be a string`);
  if (text(parent, name) === value) return;
  putElementText(ensure(parent, name), value);
}

/** Edit a scalar without discarding extension markup, comments, or instructions. */
export function putElementText(element: XmlElement, value: string): void {
  if (getText(element) === value) return;
  if (element.children.some((node) => node.type === "element"))
    throw new QgsError(
      "INVALID_EDIT",
      `Cannot replace ${element.name} without losing nested extension elements`,
    );
  const texts = element.children.filter(
    (node) => node.type === "text" || node.type === "cdata",
  );
  if (!texts.length) {
    element.children.push({ type: "text", value });
    return;
  }
  let offset = 0;
  for (const node of texts) {
    const length = node.value.length;
    node.value = value.slice(
      offset,
      node === texts.at(-1) ? undefined : offset + length,
    );
    offset += length;
  }
}

export function putAttribute(
  parent: XmlElement,
  name: string,
  value: string | number | boolean | undefined,
): void {
  if (value === undefined) {
    delete parent.attributes[name];
    return;
  }
  if (typeof value === "number" && !Number.isFinite(value))
    throw new QgsError("INVALID_EDIT", `${name} must be finite`);
  const old = parent.attributes[name];
  if (typeof value === "number" && number(old) === value) return;
  if (typeof value === "boolean" && boolean(old) === value) return;
  parent.attributes[name] =
    typeof value === "boolean" ? (value ? "1" : "0") : String(value);
}

export function putNumber(
  parent: XmlElement,
  name: string,
  value: number | undefined,
): void {
  if (value === undefined) {
    remove(parent, name);
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new QgsError("INVALID_EDIT", `${name} must be a finite number`);
  if (number(text(parent, name)) !== value)
    putText(parent, name, String(value));
}

// Replacing a list in place preserves comments, whitespace, and unrelated siblings.
// New items go after the last old item; removing an item never removes its neighbors.
export function replaceChildren(
  parent: XmlElement,
  names: readonly string[],
  replacements: XmlElement[],
): void {
  const original = parent.children;
  const result: XmlElement["children"] = [];
  let next = 0;
  const last = original.reduce(
    (last, node, index) =>
      node.type === "element" && names.includes(node.name) ? index : last,
    -1,
  );
  for (const [index, node] of original.entries()) {
    if (node.type === "element" && names.includes(node.name)) {
      const replacement = replacements[next++];
      if (replacement) result.push(replacement);
    } else result.push(node);
    if (index === last) result.push(...replacements.slice(next));
  }
  if (last === -1) result.push(...replacements);
  parent.children = result;
}

export function readCrs(parent: XmlElement, name: string): QgsCrs | undefined {
  const element = findChild(parent, name);
  const srs = element && findChild(element, "spatialrefsys");
  if (!srs) return undefined;
  const crs: QgsCrs = {};
  for (const [field, tag] of Object.entries(crsStrings)) {
    const value = text(srs, tag);
    if (value !== undefined) crs[field as keyof typeof crsStrings] = value;
  }
  const srsId = number(text(srs, "srsid"));
  const srid = number(text(srs, "srid"));
  const geographic = boolean(text(srs, "geographicflag"));
  if (srsId !== undefined) crs.srsId = srsId;
  if (srid !== undefined) crs.srid = srid;
  if (geographic !== undefined) crs.geographic = geographic;
  if (srs.attributes.nativeFormat !== undefined)
    crs.nativeFormat = srs.attributes.nativeFormat;
  if (crs.authId && crs.srsId === undefined && !crs.wkt && !crs.proj4)
    Object.assign(crs, { extensions: { origin: { authId: crs.authId } } });
  return crs;
}

export function writeCrs(
  parent: XmlElement,
  name: string,
  crs: QgsCrs | undefined,
): void {
  if (!crs) {
    // Keep a preexisting empty container; it may carry unmodeled metadata.
    if (readCrs(parent, name) !== undefined) remove(parent, name);
    return;
  }
  const previous = readCrs(parent, name);
  const srs = ensure(ensure(parent, name), "spatialrefsys");
  for (const [field, tag] of Object.entries(crsStrings))
    putText(srs, tag, crs[field as keyof typeof crsStrings]);
  // QGIS gates authid lookup on a positive legacy system ID (< 100000),
  // even though the actual definition is then resolved exclusively by authid.
  // For authority-only input, 1 is a lookup marker, not a database-ID claim.
  // Never guess an authority's QGIS database ID or require callers to know it.
  const authorityOnly =
    crs.authId && !/^USER:/iu.test(crs.authId) && !crs.wkt && !crs.proj4;
  const newAuthority =
    crs.extensions?.origin?.authId === undefined ||
    crs.extensions.origin.authId !== crs.authId ||
    previous?.srsId !== undefined;
  putNumber(
    srs,
    "srsid",
    crs.srsId ?? (authorityOnly && newAuthority ? 1 : undefined),
  );
  putNumber(srs, "srid", crs.srid);
  if (crs.geographic === undefined) remove(srs, "geographicflag");
  else if (boolean(text(srs, "geographicflag")) !== crs.geographic)
    putText(srs, "geographicflag", crs.geographic ? "true" : "false");
  putAttribute(srs, "nativeFormat", crs.nativeFormat);
}

export function readExtent(
  parent: XmlElement,
  name = "extent",
): QgsRectangle | undefined {
  const element = findChild(parent, name);
  if (
    !element ||
    (!findChild(element, "xmin") && element.attributes.xmin === undefined)
  )
    return undefined;
  const coordinates = ["xmin", "ymin", "xmax", "ymax"] as const;
  const result = {} as QgsRectangle;
  for (const coordinate of coordinates) {
    const value = number(
      element.attributes[coordinate] ?? text(element, coordinate),
    );
    if (value === undefined)
      throw new QgsError("INVALID_PROJECT", `Extent is missing ${coordinate}`);
    result[coordinate] = value;
  }
  return result;
}

export function writeExtent(
  parent: XmlElement,
  extent: QgsRectangle | undefined,
  name = "extent",
): void {
  if (!extent) {
    if (readExtent(parent, name)) remove(parent, name);
    return;
  }
  const element = ensure(parent, name);
  for (const coordinate of ["xmin", "ymin", "xmax", "ymax"] as const) {
    if (
      name === "DefaultViewExtent" ||
      element.attributes[coordinate] !== undefined
    )
      putAttribute(element, coordinate, extent[coordinate]);
    else putNumber(element, coordinate, extent[coordinate]);
  }
}
