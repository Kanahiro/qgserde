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
): void {
  // QgsProjectViewSettings appeared in 3.10.1; its rotation property in 3.28.
  const modernExtent =
    target.major === 4 ||
    target.minor > 10 ||
    (target.minor === 10 && target.patch >= 1);
  const modernRotation = target.major === 4 || target.minor >= 28;
  let view = findChild(root, "ProjectViewSettings");
  let canvas = findChild(root, "mapcanvas");
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
    writeExtent(view, project.extent, "DefaultViewExtent");
    if (project.extent)
      writeCrs(
        view,
        "DefaultViewExtent",
        project.extent.crs ?? (hadExtent ? undefined : project.crs),
      );
    putAttribute(view, "rotation", project.rotation);
  }
  if (canvas) {
    writeExtent(canvas, project.extent);
    if (project.extent)
      writeCrs(canvas, "destinationsrs", project.extent.crs ?? project.crs);
    putNumber(canvas, "rotation", project.rotation);
  }
}
