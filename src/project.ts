import {
  boolean,
  ensure,
  number,
  putAttribute,
  putNumber,
  putText,
  readCrs,
  readExtent,
  remove,
  replaceChildren,
  text,
  writeCrs,
  writeExtent,
} from "./codec.ts";
import { QgsError } from "./errors.ts";
import { readLayer, readLayerId, writeLayer } from "./layer-codec.ts";
import { readTree, writeTree } from "./tree-codec.ts";
import type {
  QgsLayerTreeGroup,
  QgsProject,
  QgsProjectMetadata,
  SerializeOptions,
  XmlDocument,
} from "./types.ts";
import {
  normalizeVersion,
  parseQgisVersion,
  versionNumber,
} from "./version.ts";
import {
  createElement,
  findChild,
  findChildren,
  readXml,
  writeXml,
} from "./xml.ts";

const metadataTags = {
  identifier: "identifier",
  parentIdentifier: "parentidentifier",
  language: "language",
  type: "type",
  abstract: "abstract",
  author: "author",
  creationDateTime: "creation",
} as const;

function projectionsEnabled(document: XmlDocument): boolean {
  const properties = findChild(document.root, "properties");
  const spatial = properties && findChild(properties, "SpatialRefSys");
  return (spatial && boolean(text(spatial, "ProjectionsEnabled"))) ?? false;
}

function readTitle(document: XmlDocument): string {
  const metadata = findChild(document.root, "projectMetadata");
  return (
    (metadata && text(metadata, "title")) || text(document.root, "title") || ""
  );
}

/** Deserialize into the QGIS domain model. XML is retained only for unmodeled settings. */
export function parseQgs(xml: string): QgsProject {
  const document = readXml(xml);
  const root = document.root;
  if (root.name !== "qgis")
    throw new QgsError(
      "INVALID_PROJECT",
      "A QGS project must have a <qgis> root",
    );
  const version = root.attributes.version;
  if (typeof version !== "string")
    throw new QgsError(
      "INVALID_PROJECT",
      "The <qgis> root must have a version attribute",
    );
  parseQgisVersion(version);
  const container = findChild(root, "projectlayers");
  const project: QgsProject = {
    version,
    title: readTitle(document),
    metadata: {},
    layers: container ? findChildren(container, "maplayer").map(readLayer) : [],
    preservedXml: document,
  };
  const crs = readCrs(root, "projectCrs");
  const verticalCrs = readCrs(root, "verticalCrs");
  if (crs && projectionsEnabled(document)) project.crs = crs;
  if (verticalCrs) project.verticalCrs = verticalCrs;
  const homePath = findChild(root, "homePath")?.attributes.path;
  if (homePath !== undefined) project.homePath = homePath;
  const view = findChild(root, "ProjectViewSettings");
  const canvas = findChild(root, "mapcanvas");
  const extent =
    (view && readExtent(view, "DefaultViewExtent")) ||
    (canvas && readExtent(canvas));
  const rotation = number(
    view?.attributes.rotation ?? (canvas && text(canvas, "rotation")),
  );
  if (extent) {
    project.extent = extent;
    const extentCrs =
      (view && readCrs(view, "DefaultViewExtent")) ||
      (canvas && readCrs(canvas, "destinationsrs"));
    if (extentCrs) project.extent.crs = extentCrs;
  }
  if (rotation !== undefined) project.rotation = rotation;
  const tree = findChild(root, "layer-tree-group");
  if (tree) {
    const parsed = readTree(tree);
    if (parsed.type === "group") project.layerTree = parsed;
  }
  const order = findChild(root, "layerorder");
  if (order)
    project.layerOrder = findChildren(order, "layer").map(
      (layer) => layer.attributes.id ?? "",
    );
  const metadata = findChild(root, "projectMetadata");
  if (metadata) {
    for (const [field, tag] of Object.entries(metadataTags)) {
      const value = text(metadata, tag);
      if (value !== undefined)
        project.metadata[field as keyof QgsProjectMetadata] = value;
    }
  }
  return project;
}

function encodeProject(project: QgsProject): XmlDocument {
  const document = structuredClone(
    project.preservedXml ??
      ({
        declaration: { version: "1.0", encoding: "UTF-8" },
        before: [
          {
            type: "doctype",
            value: " qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'",
          },
        ],
        root: createElement("qgis"),
        after: [],
      } satisfies XmlDocument),
  );
  const root = document.root;
  if (root.name !== "qgis")
    throw new QgsError(
      "INVALID_EDIT",
      "The preserved document must have a <qgis> root",
    );
  putAttribute(root, "version", project.version);
  if (typeof project.title !== "string")
    throw new QgsError("INVALID_EDIT", "Project title must be a string");
  // Avoid changing redundant legacy values on untouched input. A title edit owns all
  // three storage locations, so QGIS cannot override it with stale project metadata.
  if (!project.preservedXml || readTitle(document) !== project.title) {
    putText(root, "title", project.title);
    putText(ensure(root, "projectMetadata"), "title", project.title);
    putAttribute(root, "projectname", project.title);
  }
  const metadata = findChild(root, "projectMetadata");
  for (const [field, tag] of Object.entries(metadataTags)) {
    const value = project.metadata[field as keyof QgsProjectMetadata];
    if (metadata || value !== undefined)
      putText(metadata ?? ensure(root, "projectMetadata"), tag, value);
  }
  // QGIS ignores <projectCrs> unless this legacy property is enabled. Keep this
  // duplication inside the codec: assigning/removing project.crs controls both.
  if (project.crs || projectionsEnabled(document)) {
    writeCrs(root, "projectCrs", project.crs);
    const spatial = ensure(ensure(root, "properties"), "SpatialRefSys");
    putText(spatial, "ProjectionsEnabled", project.crs ? "1" : "0");
    putAttribute(ensure(spatial, "ProjectionsEnabled"), "type", "int");
  }
  writeCrs(root, "verticalCrs", project.verticalCrs);
  if (project.homePath !== undefined)
    putAttribute(ensure(root, "homePath"), "path", project.homePath);
  else remove(root, "homePath");
  const view = findChild(root, "ProjectViewSettings");
  const canvas = findChild(root, "mapcanvas");
  // Keep each representation in sync if both old and new view settings exist.
  const targetVersion = parseQgisVersion(project.version);
  const usesModernView =
    targetVersion.major >= 4 ||
    (targetVersion.major === 3 && targetVersion.minor >= 10);
  if (view) writeExtent(view, project.extent, "DefaultViewExtent");
  if (canvas) writeExtent(canvas, project.extent);
  if (!view && !canvas && project.extent) {
    if (usesModernView)
      writeExtent(
        ensure(root, "ProjectViewSettings"),
        project.extent,
        "DefaultViewExtent",
      );
    else writeExtent(ensure(root, "mapcanvas"), project.extent);
  }
  const viewExtent = findChild(root, "ProjectViewSettings");
  if (viewExtent && project.extent) {
    const sourceView =
      project.preservedXml &&
      findChild(project.preservedXml.root, "ProjectViewSettings");
    const hadExtent = sourceView && findChild(sourceView, "DefaultViewExtent");
    writeCrs(
      viewExtent,
      "DefaultViewExtent",
      project.extent.crs ?? (hadExtent ? undefined : project.crs),
    );
  }
  const oldCanvas = findChild(root, "mapcanvas");
  if (oldCanvas && project.extent)
    writeCrs(oldCanvas, "destinationsrs", project.extent.crs ?? project.crs);
  if (view) putAttribute(view, "rotation", project.rotation);
  if (canvas) putNumber(canvas, "rotation", project.rotation);
  if (!view && !canvas && project.rotation !== undefined) {
    if (usesModernView)
      putAttribute(
        ensure(root, "ProjectViewSettings"),
        "rotation",
        project.rotation,
      );
    else putNumber(ensure(root, "mapcanvas"), "rotation", project.rotation);
  }
  const oldContainer = findChild(root, "projectlayers");
  const oldIds = new Set(
    oldContainer ? findChildren(oldContainer, "maplayer").map(readLayerId) : [],
  );
  const ids = new Set<string>();
  const renamed = new Map<string, string>();
  for (const layer of project.layers) {
    if (ids.has(layer.id))
      throw new QgsError("INVALID_EDIT", `Duplicate layer ID: ${layer.id}`);
    ids.add(layer.id);
    const previousId = layer.preservedXml && readLayerId(layer.preservedXml);
    if (previousId && previousId !== layer.id)
      renamed.set(previousId, layer.id);
  }
  const resolve = (id: string): string => renamed.get(id) ?? id;
  if (oldContainer || project.layers.length)
    replaceChildren(
      oldContainer ?? ensure(root, "projectlayers"),
      ["maplayer"],
      project.layers.map(writeLayer),
    );
  const addedLayers = project.layers.some(
    (layer) =>
      !oldIds.has(
        layer.preservedXml ? readLayerId(layer.preservedXml) : layer.id,
      ),
  );
  const tree = project.layerTree ?? (addedLayers ? emptyTree() : undefined);
  if (tree)
    replaceChildren(
      root,
      ["layer-tree-group"],
      [
        writeTree(
          tree,
          project.layers,
          project.layerTree ? oldIds : new Set(),
          resolve,
        ),
      ],
    );
  else remove(root, "layer-tree-group");
  if (project.layerOrder) {
    const orderIds = project.layerOrder
      .map(resolve)
      .filter((id) => ids.has(id));
    for (const layer of project.layers) {
      const oldId = layer.preservedXml && readLayerId(layer.preservedXml);
      if (!oldIds.has(oldId ?? layer.id) && !orderIds.includes(layer.id))
        orderIds.push(layer.id);
    }
    replaceChildren(
      ensure(root, "layerorder"),
      ["layer"],
      orderIds.map((id) => {
        const old = findChild(root, "layerorder");
        const source =
          old &&
          findChildren(old, "layer").find(
            (item) => resolve(item.attributes.id ?? "") === id,
          );
        const element = structuredClone(source ?? createElement("layer"));
        putAttribute(element, "id", id);
        return element;
      }),
    );
  } else remove(root, "layerorder");
  return document;
}

/** Serialize typed properties without mutating the model or its XML snapshots. */
export function serializeQgs(
  project: QgsProject,
  options: SerializeOptions = {},
): string {
  const from = project.version;
  parseQgisVersion(from);
  const to =
    options.version === undefined ? from : normalizeVersion(options.version);
  const changed = versionNumber(from) !== versionNumber(to);
  if (changed && !options.migrate && options.versionPolicy !== "preserve")
    throw new QgsError(
      "MIGRATION_REQUIRED",
      `QGIS ${from} → ${to} requires a migrate callback, or versionPolicy: "preserve" to change only the version label`,
    );
  try {
    const copy = structuredClone(project);
    if (changed && options.migrate) options.migrate(copy, { from, to });
    copy.version = to;
    return writeXml(encodeProject(copy));
  } catch (error) {
    if (error instanceof QgsError || (changed && options.migrate)) throw error;
    throw new QgsError(
      "INVALID_EDIT",
      `Invalid project edit: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function emptyTree(): QgsLayerTreeGroup {
  return {
    type: "group",
    name: "",
    checked: "checked",
    expanded: true,
    children: [],
  };
}

export function createProject(version: string, title = ""): QgsProject {
  const normalized = normalizeVersion(version);
  const { major } = parseQgisVersion(normalized);
  if (major !== 3 && major !== 4)
    throw new QgsError(
      "INVALID_VERSION",
      "Creating projects is supported for QGIS 3 and 4",
    );
  return {
    version: normalized,
    title,
    layers: [],
    metadata: {},
    layerTree: emptyTree(),
  };
}
