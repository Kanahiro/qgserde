import {
  ensure,
  number,
  putAttribute,
  putNumber,
  readCrs,
  readExtent,
  text,
  writeCrs,
  writeExtent,
} from "./codec.ts";
import { QgsError } from "./errors.ts";
import type { ExtensionCodec } from "./extensions.ts";
import type { QgisVersion, QgsProject, XmlElement } from "./types.ts";
import { findChild } from "./xml.ts";

type ProjectView = Pick<QgsProject, "extent" | "rotation">;

export function readView(root: XmlElement): ProjectView {
  const view = findChild(root, "ProjectViewSettings");
  const canvas = findChild(root, "mapcanvas");
  const result: ProjectView = {};
  const modernExtent = view && readExtent(view, "DefaultViewExtent");
  const extent = modernExtent ?? (canvas && readExtent(canvas));
  if (extent) {
    const crs =
      modernExtent && view
        ? readCrs(view, "DefaultViewExtent")
        : canvas && readCrs(canvas, "destinationsrs");
    result.extent = { ...extent, ...(crs ? { crs } : {}) };
  }
  const rotation = number(
    view?.attributes.rotation ?? (canvas && text(canvas, "rotation")),
  );
  if (rotation !== undefined) result.rotation = rotation;
  return result;
}

/** Target format owns storage decisions; the source layout is only a preservation hint. */
export function writeView(
  root: XmlElement,
  project: QgsProject,
  target: QgisVersion,
  codec: ExtensionCodec,
): void {
  // QgsProjectViewSettings appeared in 3.10.1; its rotation property in 3.28.
  const modernExtent =
    target.major === 4 ||
    target.minor > 10 ||
    (target.minor === 10 && target.patch >= 1);
  const modernRotation = target.major === 4 || target.minor >= 28;
  let view = findChild(root, "ProjectViewSettings");
  let canvas = findChild(root, "mapcanvas");
  const canvasExtent = canvas && findChild(canvas, "extent");
  const independentExtent =
    !!canvasExtent &&
    !codec.controls(canvasExtent, "extent") &&
    (canvasExtent.attributes.xmin !== undefined ||
      !!findChild(canvasExtent, "xmin"));
  const canvasRotation = canvas && findChild(canvas, "rotation");
  const independentRotation =
    !!canvasRotation && !codec.controls(canvasRotation, "rotation");
  if (
    (independentExtent && project.extent === undefined) ||
    (independentRotation &&
      project.rotation === undefined &&
      codec.controls(view, "rotation"))
  )
    throw new QgsError(
      "INVALID_EDIT",
      "Cannot remove the default view while retaining a conflicting independent legacy view",
    );
  if (
    (!modernExtent && independentExtent && project.extent) ||
    (!modernRotation && independentRotation && project.rotation !== undefined)
  )
    throw new QgsError(
      "INVALID_EDIT",
      "The target version cannot represent independent modern and legacy view settings without data loss",
    );
  if (
    (project.extent && modernExtent) ||
    (project.rotation !== undefined && modernRotation)
  )
    view ??= ensure(root, "ProjectViewSettings");
  if (
    (project.extent && !modernExtent) ||
    (project.rotation !== undefined && !modernRotation)
  )
    canvas ??= ensure(root, "mapcanvas");

  // Synchronize existing alternate representations, preserving their unrelated settings.
  if (view) {
    const hadExtent = findChild(view, "DefaultViewExtent");
    const ownsExtent = modernExtent || codec.controls(hadExtent, "extent");
    if (ownsExtent) writeExtent(view, project.extent, "DefaultViewExtent");
    if (project.extent && ownsExtent)
      writeCrs(
        view,
        "DefaultViewExtent",
        project.extent.crs ?? (hadExtent ? undefined : project.crs),
      );
    if (
      (modernRotation && project.rotation !== undefined) ||
      codec.controls(view, "rotation")
    )
      putAttribute(view, "rotation", project.rotation);
  }
  if (canvas) {
    if (!independentExtent) writeExtent(canvas, project.extent);
    if (project.extent && !independentExtent)
      writeCrs(canvas, "destinationsrs", project.extent.crs ?? project.crs);
    if (!independentRotation) putNumber(canvas, "rotation", project.rotation);
  }
}
