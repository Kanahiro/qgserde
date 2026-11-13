import { QgsError } from "./errors.ts";
import type { QgsProject, SerializeOptions } from "./types.ts";
import {
  normalizeVersion,
  parseQgisVersion,
  versionNumber,
} from "./version.ts";
import {
  createElement,
  findChild,
  getText,
  readXml,
  setText,
  writeXml,
} from "./xml.ts";

function validateProject(project: QgsProject): string {
  if (project.root.type !== "element" || project.root.name !== "qgis") {
    throw new QgsError(
      "INVALID_PROJECT",
      "A QGS project must have a <qgis> root",
    );
  }
  const version = project.root.attributes.version;
  if (typeof version !== "string") {
    throw new QgsError(
      "INVALID_PROJECT",
      "The <qgis> root must have a version attribute",
    );
  }
  parseQgisVersion(version);
  return version;
}

/** Reads QGS XML into mutable, JSON-compatible objects without dropping unknown settings. */
export function parseQgs(xml: string): QgsProject {
  const project = readXml(xml);
  validateProject(project);
  return project;
}

/** Modern QGIS prefers project metadata; older files use the root title. */
export function getProjectTitle(project: QgsProject): string {
  const metadata = findChild(project.root, "projectMetadata");
  const metadataTitle = metadata && findChild(metadata, "title");
  if (metadataTitle && getText(metadataTitle)) return getText(metadataTitle);
  const title = findChild(project.root, "title");
  return title ? getText(title) : "";
}

/** Keeps the legacy title, metadata title and projectname attribute consistent. */
export function setProjectTitle(project: QgsProject, title: string): void {
  let metadata = findChild(project.root, "projectMetadata");
  if (!metadata) {
    metadata = createElement("projectMetadata");
    project.root.children.push(metadata);
  }
  for (const parent of [project.root, metadata]) {
    let element = findChild(parent, "title");
    if (!element) {
      element = createElement("title");
      parent.children.push(element);
    }
    setText(element, title);
  }
  project.root.attributes.projectname = title;
}

/** Writes an isolated copy, including when a caller-supplied migration fails. */
export function serializeQgs(
  project: QgsProject,
  options: SerializeOptions = {},
): string {
  const from = validateProject(project);
  const to =
    options.version === undefined ? from : normalizeVersion(options.version);
  const changed = versionNumber(from) !== versionNumber(to);
  if (changed && !options.migrate && options.versionPolicy !== "preserve") {
    throw new QgsError(
      "MIGRATION_REQUIRED",
      `QGIS ${from} → ${to} requires a migrate callback, or versionPolicy: "preserve" to change only the version label`,
    );
  }
  let copy: QgsProject;
  try {
    copy = structuredClone(project);
  } catch (error) {
    throw new QgsError(
      "INVALID_EDIT",
      "The project must contain only cloneable data",
      { cause: error },
    );
  }
  if (changed && options.migrate) options.migrate(copy, { from, to });
  copy.root.attributes.version = to;
  validateProject(copy);
  return writeXml(copy);
}

/** A minimal QGIS 3/4 project; QGIS supplies defaults for omitted settings. */
export function createProject(version: string, title = ""): QgsProject {
  const normalized = normalizeVersion(version);
  const { major } = parseQgisVersion(normalized);
  if (major !== 3 && major !== 4) {
    throw new QgsError(
      "INVALID_VERSION",
      "Creating projects is supported for QGIS 3 and 4",
    );
  }
  const project: QgsProject = {
    declaration: { version: "1.0", encoding: "UTF-8" },
    before: [
      {
        type: "doctype",
        value: " qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'",
      },
    ],
    root: createElement("qgis", { version: normalized }, [
      createElement("title"),
      createElement(
        "layer-tree-group",
        { name: "", checked: "Qt::Checked", expanded: "1" },
        [createElement("custom-order", { enabled: "0" })],
      ),
      createElement("projectlayers"),
    ]),
    after: [],
  };
  setProjectTitle(project, title);
  return project;
}
