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
import type {
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

export function readTree(
  element: XmlElement,
  codec: ExtensionCodec,
): QgsLayerTreeNode {
  const state = {
    expanded: boolean(element.attributes.expanded) ?? true,
    checked: readCheckState(element.attributes.checked),
  };
  if (element.name === "layer-tree-layer")
    return codec.remember(
      { type: "layer", layerId: element.attributes.id ?? "", ...state },
      element,
    );
  const group: QgsLayerTreeGroup = {
    type: "group",
    name: element.attributes.name ?? "",
    ...state,
    children: findChildren(element)
      .filter(
        (child) =>
          child.name === "layer-tree-group" ||
          child.name === "layer-tree-layer",
      )
      .map((child) => readTree(child, codec)),
  };
  const order = findChild(element, "custom-order");
  if (order)
    group.customOrder = {
      enabled: boolean(order.attributes.enabled) ?? false,
      layerIds: findChildren(order, "item").map(getText),
    };
  return codec.remember(group, element);
}

/** Resolve IDs from typed layers, including renamed IDs, without changing caller data. */
export function writeTree(
  tree: QgsLayerTreeGroup,
  layers: QgsMapLayer[],
  originalIds: Set<string>,
  resolve: (id: string) => string,
  codec: ExtensionCodec,
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
      codec.source(node) ??
        createElement(
          node.type === "group" ? "layer-tree-group" : "layer-tree-layer",
        ),
    );
    if (element.attributes.expanded !== undefined || !node.expanded)
      putAttribute(element, "expanded", node.expanded);
    if (
      element.attributes.checked !== undefined ||
      node.checked !== "checked"
    ) {
      const state = checkStates[node.checked];
      if (!state)
        throw new QgsError("INVALID_EDIT", "Invalid layer-tree check state");
      putAttribute(element, "checked", state);
    }
    if (node.type === "layer") {
      const id = resolve(node.layerId);
      const layer = layerMap.get(id);
      active.delete(node);
      if (!layer && originalIds.has(node.layerId)) return undefined;
      if (!layer && codec.source(node)) return element;
      if (!layer)
        throw new QgsError(
          "INVALID_EDIT",
          `Layer tree references missing layer: ${id}`,
        );
      referenced.add(id);
      putAttribute(element, "id", id);
      const sourceLayer = codec.source(layer);
      for (const [attribute, tag, value] of [
        ["name", "layername", layer.name],
        ["source", "datasource", layer.source],
        ["providerKey", "provider", layer.provider],
      ] as const) {
        // Tree sources may legitimately contain provider-generated UIDs absent
        // from maplayer sources. Only a typed edit should replace those values.
        if (
          !codec.source(node) ||
          !sourceLayer ||
          (text(sourceLayer, tag) ?? "") !== value
        )
          putAttribute(element, attribute, value);
      }
      return element;
    }
    if (element.attributes.name !== undefined || node.name !== "")
      putAttribute(element, "name", node.name);
    const children = node.children.flatMap((child) => {
      const encoded = encode(child, depth + 1);
      return encoded ? [encoded] : [];
    });
    replaceChildren(
      element,
      ["layer-tree-group", "layer-tree-layer"],
      children,
    );
    if (node.customOrder) {
      const order = ensure(element, "custom-order");
      if (order.attributes.enabled !== undefined || node.customOrder.enabled)
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
