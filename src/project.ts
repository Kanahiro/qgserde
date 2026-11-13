import {
  boolean,
  ensure,
  putAttribute,
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
import { metadataTags } from "./schema.ts";
import { readTree, writeTree } from "./tree-codec.ts";
import type {
  CreateProjectOptions,
  QgsLayerTreeGroup,
  QgsProject,
  QgsProjectMetadata,
  SerializeOptions,
  XmlDocument,
  XmlElement,
} from "./types.ts";
import { normalizeVersion, parseQgisVersion } from "./version.ts";
import { readView, writeView } from "./view-codec.ts";
import {
  createElement,
  findChild,
  findChildren,
  readXml,
  writeXml,
} from "./xml.ts";

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

/**
 * QGSのXMLを、バージョンに依存しない編集可能なモデルへ読み取ります。
 *
 * @param xml - ファイルからデコードしたQGSのUnicode文字列。ZIP形式のQGZは扱いません。
 * @returns 未知の値と順序情報を分離して保持するプロジェクト。元XMLは保持しません。
 * @throws {@link QgsError} XMLが不正な場合は`INVALID_XML`、プロジェクト構造や
 * 値が不正な場合は`INVALID_PROJECT`、バージョン表記が不正な場合は`INVALID_VERSION`。
 * @example
 * ```ts
 * const project = parseQgs(qgsXml);
 * project.title = "編集後の地図";
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
        project.metadata[field as keyof QgsProjectMetadata] = value;
    }
  }
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
  if (typeof project.title !== "string")
    throw new QgsError("INVALID_EDIT", "Project title must be a string");
  // Avoid changing redundant legacy values on untouched input. A title edit owns all
  // three storage locations, so QGIS cannot override it with stale project metadata.
  if (readTitle(document) !== project.title) {
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
  writeView(root, project, parseQgisVersion(version), codec);
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
      project.layers.map((layer) => writeLayer(layer, codec)),
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
 * モデルを指定したQGIS 3/4の形式でXMLに書き出します。
 *
 * 同じモデルを異なるバージョンへ繰り返し書き出せます。モデルや拡張データを変更しません。
 * 既知の形式差は変換し、未知の値と順序は拡張データから復元します。
 * 出力先QGISにない機能を代替したり、プロジェクト全体の互換性を検証したりはしません。
 *
 * @param project - 読み取ったモデル、または {@link createProject} で作成したモデル。
 * @param options - 出力先バージョン。省略できません。
 * @returns XML文字列。XML宣言がある場合の文字コード表記はUTF-8です。
 * @throws {@link QgsError} 出力先が不正な場合は`INVALID_VERSION`、重複ID・循環・
 * 有限でない数値・データの意味や構造を失う操作など、書き出せない編集は`INVALID_EDIT`。
 * @example
 * ```ts
 * const project = createProject({ title: "同じ地図" });
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
 * バージョンに依存しないプロジェクトを作成します。
 *
 * テンプレート指定時は {@link parseQgs} と同じ規則で読み取り、既知の設定・レイヤー・
 * ツリー・未知のXMLをすべて引き継ぎます。省略時は型付きの空のプロジェクトを作ります。
 * 元XMLのスナップショットは保持しません。ファイルI/Oは呼び出し側で行います。
 * @param options - テンプレートとタイトル。オブジェクト全体も省略できます。
 * @returns 編集可能なモデル。テンプレート省略時は空のレイヤー配列・メタデータ・ルートグループを持ちます。
 * @throws {@link QgsError} テンプレートには {@link parseQgs} と同じ検証を行います。
 * オプションがオブジェクトでない場合やタイトルが文字列でない場合は`INVALID_EDIT`。
 * @example
 * ```ts
 * const empty = createProject();
 * const project = createProject({ templateXml, title: "新しい地図" });
 * project.crs = { authId: "EPSG:4326" };
 * const xml = serializeQgs(project, { version: "4.2" });
 * ```
 */
export function createProject(options: CreateProjectOptions = {}): QgsProject {
  if (options === null || typeof options !== "object" || Array.isArray(options))
    throw new QgsError("INVALID_EDIT", "Project options must be an object");
  if (options.title !== undefined && typeof options.title !== "string")
    throw new QgsError("INVALID_EDIT", "Project title must be a string");
  const project: QgsProject =
    options.templateXml === undefined
      ? { title: "", metadata: {}, layers: [], layerTree: emptyTree() }
      : parseQgs(options.templateXml);
  if (options.title !== undefined) project.title = options.title;
  return project;
}
