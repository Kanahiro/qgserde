import { NAME_RE } from "xmlchars/xml/1.0/ed5.js";
import {
  boolean,
  ensure,
  putAttribute,
  putElementText,
  putText,
  readCrs,
  remove,
  replaceChildren,
  text,
  writeCrs,
} from "./codec.ts";
import { QgsError } from "./errors.ts";
import { ExtensionCodec } from "./extensions.ts";
import { readLayer, readLayerId, writeLayer } from "./layer-codec.ts";
import { projectMetadataSpec, projectSpec } from "./project-settings.ts";
import { metadataTags } from "./schema.ts";
import { readSpec, writeSpec } from "./spec.ts";
import { readTree, writeTree } from "./tree-codec.ts";
import type {
  CreateProjectOptions,
  QgsLayerTreeGroup,
  QgsProject,
  SerializeOptions,
  XmlDocument,
  XmlElement,
  XmlNode,
} from "./types.ts";
import { normalizeVersion, parseQgisVersion } from "./version.ts";
import { readView, writeView } from "./view-codec.ts";
import {
  createElement,
  findChild,
  findChildren,
  getText,
  readXml,
  writeXml,
} from "./xml.ts";

// QGIS 4 writes a property key as <properties name="Key">, QGIS 3 as <Key>.
// QGIS 4.0-4.2 read both and QGIS 3 reads only <Key>. Read and update both;
// the named form wins because later QGIS versions ignore <Key> next to it.
function propertyEntries(parent: XmlElement, key: string): XmlElement[] {
  return findChildren(parent).filter((child) =>
    isNamedProperty(child) ? child.attributes.name === key : child.name === key,
  );
}

function isNamedProperty(element: XmlElement): boolean {
  return element.name === "properties" && element.attributes.name !== undefined;
}

function projectionsEnabled(document: XmlDocument): boolean {
  const properties = findChild(document.root, "properties");
  const values = (
    properties ? propertyEntries(properties, "SpatialRefSys") : []
  )
    .flatMap((spatial) => propertyEntries(spatial, "ProjectionsEnabled"))
    .sort((a, b) => Number(isNamedProperty(b)) - Number(isNamedProperty(a)));
  return (values[0] && boolean(getText(values[0]))) ?? false;
}

// QGIS 3 reads property keys only from element names, so a QGIS 4 tree must be
// rewritten. When both forms of a key exist, the named one wins, as on read.
function writeLegacyProperties(parent: XmlElement): void {
  const named = new Set(
    findChildren(parent)
      .filter(isNamedProperty)
      .map((child) => child.attributes.name),
  );
  parent.children = parent.children.flatMap((child): XmlNode[] => {
    if (child.type !== "element") return [child];
    if (!isNamedProperty(child)) {
      if (named.has(child.name)) return [];
      writeLegacyProperties(child);
      return [child];
    }
    const { name, ...attributes } = child.attributes;
    if (!name || !NAME_RE.test(name))
      throw new QgsError(
        "INVALID_EDIT",
        `Project property key ${JSON.stringify(name)} cannot be written for QGIS 3`,
      );
    const element = createElement(name, attributes, child.children);
    writeLegacyProperties(element);
    return [element];
  });
}

function writeProjectionsEnabled(root: XmlElement, enabled: boolean): void {
  const properties = ensure(root, "properties");
  const entry = (parent: XmlElement, key: string) => {
    const element = isNamedProperty(parent)
      ? createElement("properties", { name: key })
      : createElement(key);
    parent.children.push(element);
    return element;
  };
  const spatials = propertyEntries(properties, "SpatialRefSys");
  if (!spatials.length) spatials.push(entry(properties, "SpatialRefSys"));
  for (const spatial of spatials) {
    const values = propertyEntries(spatial, "ProjectionsEnabled");
    if (!values.length) values.push(entry(spatial, "ProjectionsEnabled"));
    for (const value of values) {
      putElementText(value, enabled ? "1" : "0");
      putAttribute(value, "type", "int");
    }
  }
}

function readTitle(document: XmlDocument): string {
  const metadata = findChild(document.root, "projectMetadata");
  return (
    (metadata && text(metadata, "title")) || text(document.root, "title") || ""
  );
}

/**
 * Read QGS XML into an editable model independent of the source QGIS version.
 *
 * @param xml - Decoded QGS XML as a Unicode string. Use {@link parseQgz} for `.qgz` archives.
 * @returns A project with typed properties and internal unknown-data and order information.
 * The original XML is not retained as a backup.
 * @throws {@link QgsError} `INVALID_XML` for malformed XML, `INVALID_PROJECT` for
 * invalid project structure or modeled values, or `INVALID_VERSION` for invalid version syntax.
 * @example
 * ```ts
 * const project = parseQgs(qgsXml);
 * project.title = "Regional map";
 * const xml = serializeQgs(project, { version: "4.2" });
 * ```
 */
export function parseQgs(xml: string): QgsProject {
  const codec = new ExtensionCodec();
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
    title: readTitle(document),
    metadata: {},
    layers: container
      ? findChildren(container, "maplayer").map((element) =>
          readLayer(element, codec),
        )
      : [],
    ...readView(root),
  };
  const crs = readCrs(root, "projectCrs");
  const verticalCrs = readCrs(root, "verticalCrs");
  if (crs && projectionsEnabled(document)) project.crs = crs;
  else if (crs) project.disabledCrs = crs;
  if (verticalCrs) project.verticalCrs = verticalCrs;
  const homePath = findChild(root, "homePath")?.attributes.path;
  if (homePath !== undefined) project.homePath = homePath;
  const tree = findChild(root, "layer-tree-group");
  if (tree) {
    const parsed = readTree(tree, codec);
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
        project.metadata[field as keyof typeof metadataTags] = value;
    }
    Object.assign(
      project.metadata,
      readSpec(projectMetadataSpec, metadata, codec),
    );
  }
  Object.assign(project, readSpec(projectSpec, root, codec));
  codec.captureProject(project, document);
  return project;
}

function encodeProject(project: QgsProject, version: string): XmlDocument {
  const codec = new ExtensionCodec();
  const document = codec.restoreProject(project, version);
  const root = document.root;
  if (root.name !== "qgis")
    throw new QgsError(
      "INVALID_EDIT",
      "The reconstructed document must have a <qgis> root",
    );
  putAttribute(root, "version", version);
  const target = parseQgisVersion(version);
  if (typeof project.title !== "string")
    throw new QgsError("INVALID_EDIT", "Project title must be a string");
  putText(root, "title", project.title);
  putText(ensure(root, "projectMetadata"), "title", project.title);
  putAttribute(root, "projectname", project.title);
  const metadata = findChild(root, "projectMetadata");
  if (project.metadata === null || typeof project.metadata !== "object")
    throw new QgsError("INVALID_EDIT", "Project metadata must be an object");
  for (const [field, tag] of Object.entries(metadataTags)) {
    const value = project.metadata[field as keyof typeof metadataTags];
    if (metadata || value !== undefined)
      putText(metadata ?? ensure(root, "projectMetadata"), tag, value);
  }
  writeSpec(
    projectMetadataSpec,
    project.metadata as never,
    ensure(root, "projectMetadata"),
    codec,
    target,
  );
  // Properties are written in the input's format before any QGIS 3 conversion.
  writeSpec(projectSpec, project as never, root, codec, target);
  // QGIS ignores <projectCrs> unless this legacy property is enabled. Keep this
  // duplication inside the codec: assigning/removing project.crs controls both.
  writeCrs(root, "projectCrs", project.crs ?? project.disabledCrs);
  const properties = findChild(root, "properties");
  if (properties && parseQgisVersion(version).major === 3) {
    delete properties.attributes.name;
    writeLegacyProperties(properties);
  }
  writeProjectionsEnabled(root, project.crs !== undefined);
  writeCrs(root, "verticalCrs", project.verticalCrs);
  if (project.homePath !== undefined)
    putAttribute(ensure(root, "homePath"), "path", project.homePath);
  else remove(root, "homePath");
  writeView(root, project, parseQgisVersion(version));
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
    const source = codec.source(layer);
    const previousId = source && readLayerId(source);
    if (previousId && previousId !== layer.id)
      renamed.set(previousId, layer.id);
  }
  const resolve = (id: string): string => renamed.get(id) ?? id;
  if (oldContainer || project.layers.length)
    replaceChildren(
      oldContainer ?? ensure(root, "projectlayers"),
      ["maplayer"],
      project.layers.map((layer) =>
        writeLayer(layer, codec, parseQgisVersion(version)),
      ),
    );
  const addedLayers = project.layers.some((layer) => {
    const source = codec.source(layer);
    return !oldIds.has(source ? readLayerId(source) : layer.id);
  });
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
          codec,
          target,
        ),
      ],
    );
  else remove(root, "layer-tree-group");
  if (project.layerOrder) {
    const orderIds = project.layerOrder
      .map(resolve)
      .filter((id) => ids.has(id) || !oldIds.has(id));
    for (const layer of project.layers) {
      const source = codec.source(layer);
      const oldId = source && readLayerId(source);
      if (!oldIds.has(oldId ?? layer.id) && !orderIds.includes(layer.id))
        orderIds.push(layer.id);
    }
    const oldOrder = findChild(root, "layerorder");
    const available = oldOrder ? findChildren(oldOrder, "layer") : [];
    const used = new Set<XmlElement>();
    replaceChildren(
      ensure(root, "layerorder"),
      ["layer"],
      orderIds.map((id) => {
        const source = available.find(
          (item) => !used.has(item) && resolve(item.attributes.id ?? "") === id,
        );
        if (source) used.add(source);
        const element = structuredClone(source ?? createElement("layer"));
        putAttribute(element, "id", id);
        return element;
      }),
    );
  } else remove(root, "layerorder");
  return document;
}

/**
 * Write a model as QGS XML for a specified QGIS 3 or 4 version.
 *
 * The same model can be written for different versions without mutation. Known
 * format differences are converted; unknown data and order are reconstructed
 * from extensions. Features unavailable in the target QGIS are not substituted,
 * and compatibility of the entire project is not checked.
 *
 * @param project - A parsed model or one returned by {@link createProject}.
 * @param options - Required output version.
 * @returns XML string. An XML declaration, when present, specifies UTF-8 encoding.
 * @throws {@link QgsError} `INVALID_VERSION` for an invalid target, or `INVALID_EDIT`
 * for duplicate IDs, cycles, non-finite numbers, edits that would lose data, project
 * property keys that QGIS 3 cannot store, or other invalid model data.
 * @example
 * ```ts
 * const project = createProject({ title: "Regional map" });
 * const qgis3 = serializeQgs(project, { version: "3.44" });
 * const qgis4 = serializeQgs(project, { version: "4.2" });
 * ```
 */
export function serializeQgs(
  project: QgsProject,
  options: SerializeOptions,
): string {
  const version = normalizeVersion(options?.version);
  try {
    return writeXml(encodeProject(project, version));
  } catch (error) {
    if (error instanceof QgsError) throw error;
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

/**
 * Create a project independent of any QGIS output version.
 *
 * Use {@link parseQgs} to read an existing QGS file.
 *
 * @param options - Initial settings. The object may be omitted.
 * @returns An editable model with empty layers, metadata, and a root tree group.
 * @throws {@link QgsError} `INVALID_EDIT` for invalid options or a non-string title.
 * @example
 * ```ts
 * const empty = createProject();
 * const project = createProject({ title: "Regional map" });
 * project.crs = { authId: "EPSG:4326" };
 * const xml = serializeQgs(project, { version: "4.2" });
 * ```
 */
export function createProject(options: CreateProjectOptions = {}): QgsProject {
  if (options === null || typeof options !== "object" || Array.isArray(options))
    throw new QgsError("INVALID_EDIT", "Project options must be an object");
  if (options.title !== undefined && typeof options.title !== "string")
    throw new QgsError("INVALID_EDIT", "Project title must be a string");
  return {
    title: options.title ?? "",
    metadata: {},
    layers: [],
    layerTree: emptyTree(),
  };
}
