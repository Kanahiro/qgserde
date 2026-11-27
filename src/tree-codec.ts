import type { QgsWmsDimensionAttributes } from "./attributes.generated.ts";
import {
  boolean,
  ensure,
  putAttribute,
  putElementText,
  replaceChildren,
} from "./codec.ts";
import { QgsError } from "./errors.ts";
import type { ExtensionCodec } from "./extensions.ts";
import { serverSpec } from "./layer-settings.ts";
import { treeNodeSpec, treeTags } from "./project-settings.ts";
import { readSpec, writeSpec } from "./spec.ts";
import type {
  QgisVersion,
  QgsCheckState,
  QgsLayerServerProperties,
  QgsLayerTreeGroup,
  QgsLayerTreeNode,
  QgsMapLayer,
  XmlElement,
} from "./types.ts";
import { createElement, findChild, findChildren, getText } from "./xml.ts";

const checkStates = {
  checked: "Qt::Checked",
  unchecked: "Qt::Unchecked",
  partial: "Qt::PartiallyChecked",
} as const;

function readCheckState(value: string | undefined): QgsCheckState {
  if (value === undefined || value === "Qt::Checked") return "checked";
  if (value === "Qt::Unchecked") return "unchecked";
  if (value === "Qt::PartiallyChecked") return "partial";
  throw new QgsError(
    "INVALID_PROJECT",
    `Invalid layer-tree check state: ${value}`,
  );
}

const treeElements: string[] = Object.values(treeTags);

export function readTree(
  element: XmlElement,
  codec: ExtensionCodec,
  root = true,
): QgsLayerTreeNode {
  const state = {
    expanded: boolean(element.attributes.expanded) ?? true,
    checked: readCheckState(element.attributes.checked),
  };
  if (element.name === "layer-tree-layer") {
    const node: Extract<QgsLayerTreeNode, { type: "layer" }> = {
      type: "layer",
      layerId: element.attributes.id ?? "",
      ...state,
    };
    Object.assign(node, readSpec(treeNodeSpec("layer"), element, codec));
    return codec.remember(node, element);
  }
  if (element.name === treeTags.custom) {
    const node: Extract<QgsLayerTreeNode, { type: "custom" }> = {
      type: "custom",
      id: element.attributes.id ?? "",
      name: element.attributes.name ?? "",
      ...state,
    };
    Object.assign(node, readSpec(treeNodeSpec("custom"), element, codec));
    return codec.remember(node, element);
  }
  const group: QgsLayerTreeGroup = {
    type: "group",
    name: element.attributes.name ?? "",
    ...state,
    children: findChildren(element)
      .filter((child) => treeElements.includes(child.name))
      .map((child) => readTree(child, codec, false)),
  };
  const order = findChild(element, "custom-order");
  if (order)
    group.customOrder = {
      enabled: boolean(order.attributes.enabled) ?? false,
      layerIds: findChildren(order, "item").map(getText),
    };
  Object.assign(group, readSpec(treeNodeSpec("group"), element, codec));
  if (!root) readGroupServer(group, element);
  return codec.remember(group, element);
}

// QGIS has stored a group's server settings in three ways; the model has one.
// Before 3.44: custom properties for these three fields.
const legacyServerKeys = {
  wmsShortName: "shortName",
  wmsTitle: "title",
  wmsAbstract: "abstract",
} as const;
// 3.44 to 4.2: `wms-has-time-dimension="1"` for this dimension with default
// settings. QGIS 4.4 stores it in <wmsDimensions>.
const timeDimension = "TIME";
const timeAttribute = "wms-has-time-dimension";

function before(target: QgisVersion, major: number, minor: number): boolean {
  return (
    target.major < major || (target.major === major && target.minor < minor)
  );
}

/** Fold the older storage forms into `server`, as QGIS does on read. */
function readGroupServer(group: QgsLayerTreeGroup, element: XmlElement): void {
  const server: QgsLayerServerProperties = { ...group.server };
  const custom = group.customProperties;
  if (custom) {
    for (const [key, field] of Object.entries(legacyServerKeys)) {
      const value = custom[key];
      if (typeof value !== "string") continue;
      delete custom[key];
      // An element, when present, wins over the custom property.
      server[field] ??= value;
    }
    if (!Object.keys(custom).length) delete group.customProperties;
  }
  if (
    element.attributes[timeAttribute] === "1" &&
    !server.wmsDimensions?.some((item) => item.name === timeDimension)
  )
    server.wmsDimensions = [
      ...(server.wmsDimensions ?? []),
      { name: timeDimension, defaultDisplayType: 0 },
    ];
  if (Object.keys(server).length) group.server = server;
}

const serverTags = new Set(
  serverSpec(treeTags.group).entries.flatMap((entry) =>
    "at" in entry && entry.at?.[0] ? [entry.at[0]] : [],
  ),
);

/** QGIS writes a group's server elements before its child nodes. */
function serverBeforeChildren(element: XmlElement): void {
  const first = element.children.findIndex(
    (child) => child.type === "element" && treeElements.includes(child.name),
  );
  if (first === -1) return;
  const moved = element.children
    .slice(first)
    .filter((child) => child.type === "element" && serverTags.has(child.name));
  if (!moved.length) return;
  const rest = element.children.filter((child) => !moved.includes(child));
  rest.splice(first, 0, ...moved);
  element.children = rest;
}

function isDefaultTime(dimension: QgsWmsDimensionAttributes): boolean {
  return Object.entries(dimension).every(([key, value]) =>
    key === "name"
      ? value === timeDimension
      : // QGIS reads a missing display type as 0, all values.
        key === "defaultDisplayType"
        ? value === 0 || value === undefined
        : value === undefined,
  );
}

/**
 * The group as the spec writes it for `target`, with settings moved to the
 * custom properties or attribute that target reads.
 */
function groupForTarget(
  node: QgsLayerTreeGroup,
  element: XmlElement,
  target: QgisVersion,
  root: boolean,
): QgsLayerTreeGroup {
  for (const [key, field] of Object.entries(legacyServerKeys))
    if (node.customProperties && key in node.customProperties)
      throw new QgsError(
        "INVALID_EDIT",
        `Group custom property ${key} is modeled as server.${field}`,
      );
  delete element.attributes[timeAttribute];
  const { server } = node;
  if (root && server)
    throw new QgsError(
      "INVALID_EDIT",
      "The layer-tree root has no server settings",
    );
  if (!server || !before(target, 4, 4)) return node;
  const { wmsDimensions = [], ...rest } = server;
  if (!before(target, 3, 44)) {
    if (wmsDimensions.length > 1 || !wmsDimensions.every(isDefaultTime))
      throw new QgsError(
        "INVALID_EDIT",
        `Group WMS dimensions other than one ${timeDimension} dimension with default settings cannot be written for QGIS versions before 4.4`,
      );
    if (wmsDimensions.length) element.attributes[timeAttribute] = "1";
    return { ...node, server: rest };
  }
  const { shortName, title, abstract, ...unsupported } = server;
  if (
    Object.values(unsupported).some((value) =>
      Array.isArray(value) ? value.length : value !== undefined,
    )
  )
    throw new QgsError(
      "INVALID_EDIT",
      "Group server settings other than shortName, title, and abstract cannot be written for QGIS versions before 3.44",
    );
  const legacy = Object.fromEntries(
    Object.entries({
      wmsShortName: shortName,
      wmsTitle: title,
      wmsAbstract: abstract,
    }).filter(([, value]) => value !== undefined),
  ) as Record<string, string>;
  const { server: _, ...withoutServer } = node;
  // QGIS keeps custom properties in a QVariantMap and writes them sorted.
  const customProperties = Object.fromEntries(
    Object.entries({ ...node.customProperties, ...legacy }).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    ),
  );
  return { ...withoutServer, customProperties };
}

/**
 * The data provider name QGIS writes for a layer. Annotation and group layers
 * store no `<provider>`, but QGIS gives both an `annotation` data provider.
 */
function providerKey(layer: QgsMapLayer): string {
  return !layer.provider &&
    (layer.type === "annotation" || layer.type === "group")
    ? "annotation"
    : layer.provider;
}

/**
 * Write the tree for the typed layers without changing caller data. References
 * to removed layers (in `originalIds`) are dropped; new layers are appended.
 */
export function writeTree(
  tree: QgsLayerTreeGroup,
  layers: QgsMapLayer[],
  originalIds: Set<string>,
  codec: ExtensionCodec,
  target: QgisVersion,
): XmlElement {
  const layerMap = new Map(layers.map((layer) => [layer.id, layer]));
  const referenced = new Set<string>();
  const active = new Set<QgsLayerTreeNode>();
  function encode(
    node: QgsLayerTreeNode,
    depth: number,
  ): XmlElement | undefined {
    if (active.has(node) || depth > 512)
      throw new QgsError(
        "INVALID_EDIT",
        "Cyclic or excessively deep layer tree",
      );
    active.add(node);
    const element = structuredClone(
      codec.source(node) ?? createElement(treeTags[node.type]),
    );
    putAttribute(element, "expanded", node.expanded);
    const state = checkStates[node.checked];
    if (!state)
      throw new QgsError("INVALID_EDIT", "Invalid layer-tree check state");
    putAttribute(element, "checked", state);
    const written =
      node.type === "group"
        ? groupForTarget(node, element, target, depth === 1)
        : node;
    writeSpec(
      treeNodeSpec(node.type),
      written as never,
      element,
      codec,
      target,
    );
    if (node.type === "custom") {
      putAttribute(element, "id", node.id);
      putAttribute(element, "name", node.name);
      active.delete(node);
      return element;
    }
    if (node.type === "layer") {
      const id = node.layerId;
      const layer = layerMap.get(id);
      active.delete(node);
      if (!layer && originalIds.has(node.layerId)) return undefined;
      if (!layer && !codec.source(node))
        throw new QgsError(
          "INVALID_EDIT",
          `Layer tree references missing layer: ${id}`,
        );
      if (layer) referenced.add(id);
      putAttribute(element, "id", id);
      // Name, source, and provider come from the layer. QGIS resolves the
      // reference by ID; a reference to a layer outside the project keeps
      // its stored values.
      if (layer)
        for (const [attribute, value] of [
          ["name", layer.name],
          ["source", layer.source],
          ["providerKey", providerKey(layer)],
        ] as const)
          putAttribute(element, attribute, value);
      return element;
    }
    putAttribute(element, "name", node.name);
    const children = node.children.flatMap((child) => {
      const encoded = encode(child, depth + 1);
      return encoded ? [encoded] : [];
    });
    replaceChildren(element, treeElements, children);
    if (depth > 1) serverBeforeChildren(element);
    if (node.customOrder) {
      const order = ensure(element, "custom-order");
      putAttribute(order, "enabled", node.customOrder.enabled);
      const items = node.customOrder.layerIds.filter(
        (id) => layerMap.has(id) || !originalIds.has(id),
      );
      const available = findChildren(order, "item");
      const used = new Set<XmlElement>();
      replaceChildren(
        order,
        ["item"],
        items.map((id) => {
          const source = available.find(
            (item) => !used.has(item) && getText(item) === id,
          );
          if (source) used.add(source);
          const element = structuredClone(source ?? createElement("item"));
          putElementText(element, id);
          return element;
        }),
      );
    } else
      element.children = element.children.filter(
        (child) => child.type !== "element" || child.name !== "custom-order",
      );
    active.delete(node);
    return element;
  }
  const root = encode(tree, 1);
  if (!root)
    throw new QgsError("INVALID_EDIT", "A layer tree must have a root group");
  for (const layer of layers) {
    if (!referenced.has(layer.id) && !originalIds.has(layer.id)) {
      root.children.push(
        createElement("layer-tree-layer", {
          id: layer.id,
          name: layer.name,
          source: layer.source,
          providerKey: providerKey(layer),
          checked: "Qt::Checked",
          expanded: "1",
        }),
      );
      if (tree.customOrder && !tree.customOrder.layerIds.includes(layer.id))
        ensure(root, "custom-order").children.push(
          createElement("item", {}, [{ type: "text", value: layer.id }]),
        );
    }
  }
  return root;
}
