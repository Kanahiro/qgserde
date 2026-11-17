import {
  boolean,
  ensure,
  putAttribute,
  putElementText,
  replaceChildren,
  text,
} from "./codec.ts";
import { QgsError } from "./errors.ts";
import type { ExtensionCodec } from "./extensions.ts";
import { readLayerId } from "./layer-codec.ts";
import { treeNodeSpec, treeTags } from "./project-settings.ts";
import { readSpec, writeSpec } from "./spec.ts";
import type {
  QgisVersion,
  QgsCheckState,
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
    for (const [attribute, property] of [
      ["name", "name"],
      ["source", "source"],
      ["providerKey", "provider"],
    ] as const)
      if (element.attributes[attribute] !== undefined)
        node[property] = element.attributes[attribute];
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
      .map((child) => readTree(child, codec)),
  };
  const order = findChild(element, "custom-order");
  if (order)
    group.customOrder = {
      enabled: boolean(order.attributes.enabled) ?? false,
      layerIds: findChildren(order, "item").map(getText),
    };
  Object.assign(group, readSpec(treeNodeSpec("group"), element, codec));
  return codec.remember(group, element);
}

/** Resolve IDs from typed layers, including renamed IDs, without changing caller data. */
export function writeTree(
  tree: QgsLayerTreeGroup,
  layers: QgsMapLayer[],
  originalIds: Set<string>,
  resolve: (id: string) => string,
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
    writeSpec(treeNodeSpec(node.type), node as never, element, codec, target);
    if (node.type === "custom") {
      putAttribute(element, "id", node.id);
      putAttribute(element, "name", node.name);
      active.delete(node);
      return element;
    }
    if (node.type === "layer") {
      const id = resolve(node.layerId);
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
      for (const [attribute, property] of [
        ["name", "name"],
        ["source", "source"],
        ["providerKey", "provider"],
      ] as const) {
        // Layer edits synchronize references; otherwise the tree's own modeled
        // connection may include a distinct provider-generated UID.
        const sourceLayer = layer && codec.source(layer);
        const tag =
          property === "name"
            ? "layername"
            : property === "source"
              ? "datasource"
              : "provider";
        const origin =
          layer?.extensions?.origin?.[property] ??
          (sourceLayer ? (text(sourceLayer, tag) ?? "") : undefined);
        const value =
          layer && origin !== undefined && origin !== layer[property]
            ? layer[property]
            : (node[property] ?? layer?.[property]);
        putAttribute(element, attribute, value);
      }
      return element;
    }
    putAttribute(element, "name", node.name);
    const children = node.children.flatMap((child) => {
      const encoded = encode(child, depth + 1);
      return encoded ? [encoded] : [];
    });
    replaceChildren(element, treeElements, children);
    if (node.customOrder) {
      const order = ensure(element, "custom-order");
      putAttribute(order, "enabled", node.customOrder.enabled);
      const items = node.customOrder.layerIds
        .map(resolve)
        .filter((id) => layerMap.has(id) || !originalIds.has(id));
      const available = findChildren(order, "item");
      const used = new Set<XmlElement>();
      replaceChildren(
        order,
        ["item"],
        items.map((id) => {
          const source = available.find(
            (item) => !used.has(item) && resolve(getText(item)) === id,
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
    const source = codec.source(layer);
    const oldId = source && readLayerId(source);
    const existed = originalIds.has(oldId ?? layer.id);
    if (!referenced.has(layer.id) && !existed) {
      root.children.push(
        createElement("layer-tree-layer", {
          id: layer.id,
          name: layer.name,
          source: layer.source,
          providerKey: layer.provider,
          checked: "Qt::Checked",
          expanded: "1",
        }),
      );
      if (
        tree.customOrder &&
        !tree.customOrder.layerIds.map(resolve).includes(layer.id)
      )
        ensure(root, "custom-order").children.push(
          createElement("item", {}, [{ type: "text", value: layer.id }]),
        );
    }
  }
  return root;
}
