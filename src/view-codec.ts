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
import type { QgisVersion, QgsProject, XmlElement } from "./types.ts";
import { findChild } from "./xml.ts";

type ProjectView = Pick<QgsProject, "extent" | "rotation" | "legacyView">;

export function sameExtent(
  left: QgsProject["extent"],
  right: QgsProject["extent"],
): boolean {
  return (
    left === right ||
    (!!left &&
      !!right &&
      (["xmin", "ymin", "xmax", "ymax"] as const).every(
        (key) => left[key] === right[key],
      ) &&
      JSON.stringify(left.crs) === JSON.stringify(right.crs))
  );
}

export function readView(root: XmlElement): ProjectView {
  const view = findChild(root, "ProjectViewSettings");
  const canvas = findChild(root, "mapcanvas");
  const result: ProjectView = {};
  const modernExtent = view && readExtent(view, "DefaultViewExtent");
  const canvasExtent = canvas && readExtent(canvas);
  const extent = modernExtent ?? canvasExtent;
  if (extent) {
    const crs =
      modernExtent && view
        ? readCrs(view, "DefaultViewExtent")
        : canvas && readCrs(canvas, "destinationsrs");
    result.extent = { ...extent, ...(crs ? { crs } : {}) };
  }
  const rotation =
    view?.attributes.rotation !== undefined
      ? (number(view.attributes.rotation) ?? 0)
      : number(canvas && text(canvas, "rotation"));
  if (rotation !== undefined) result.rotation = rotation;
  const canvasCrs = canvas && readCrs(canvas, "destinationsrs");
  const legacyExtent = canvasExtent
    ? {
        ...canvasExtent,
        ...(canvasCrs ? { crs: canvasCrs } : {}),
      }
    : undefined;
  const legacyRotation = number(canvas && text(canvas, "rotation"));
  const independentExtent =
    legacyExtent && modernExtent && !sameExtent(legacyExtent, result.extent);
  const independentRotation =
    view?.attributes.rotation !== undefined &&
    legacyRotation !== undefined &&
    legacyRotation !== rotation;
  if (independentExtent || independentRotation)
    result.legacyView = {
      ...(independentExtent ? { extent: legacyExtent } : {}),
      ...(independentRotation ? { rotation: legacyRotation } : {}),
    };
  return result;
}

/** Target format owns storage decisions; the source layout is only a preservation hint. */
export function writeView(
  root: XmlElement,
  project: QgsProject,
  target: QgisVersion,
): void {
  // QgsProjectViewSettings appeared in 3.10.1; its rotation property in 3.28.
  const modernExtent =
    target.major === 4 ||
    target.minor > 10 ||
    (target.minor === 10 && target.patch >= 1);
  const modernRotation = target.major === 4 || target.minor >= 28;
  let view = findChild(root, "ProjectViewSettings");
  let canvas = findChild(root, "mapcanvas");
  const independentExtent = project.legacyView?.extent !== undefined;
  const independentRotation = project.legacyView?.rotation !== undefined;
  if (
    (independentExtent && project.extent === undefined) ||
    (independentRotation && project.rotation === undefined)
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
    (project.rotation !== undefined && !modernRotation) ||
    independentExtent ||
    independentRotation
  )
    canvas ??= ensure(root, "mapcanvas");

  // Synchronize existing alternate representations, preserving their unrelated settings.
  if (view) {
    writeExtent(view, project.extent, "DefaultViewExtent");
    if (project.extent)
      writeCrs(view, "DefaultViewExtent", project.extent.crs ?? project.crs);
    putAttribute(
      view,
      "rotation",
      modernRotation ? project.rotation : undefined,
    );
  }
  if (canvas) {
    const extent = project.legacyView?.extent ?? project.extent;
    writeExtent(canvas, extent);
    writeCrs(
      canvas,
      "destinationsrs",
      extent?.crs ?? (extent ? project.crs : undefined),
    );
    putNumber(
      canvas,
      "rotation",
      project.legacyView?.rotation ?? project.rotation,
    );
  }
}
