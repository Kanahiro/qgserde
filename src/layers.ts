import { QgsError } from "./errors.ts";
import type { QgsProject, XmlElement } from "./types.ts";
import {
  createElement,
  findChild,
  findChildren,
  getText,
  setText,
} from "./xml.ts";

export interface LayerDefinition {
  /** Stable project-wide identifier, chosen by the caller. */
  id: string;
  name: string;
  type: "vector" | "raster";
  provider: string;
  source: string;
  /** Authority identifier such as EPSG:4326. QGIS reads this from <srs>. */
  crs: string;
}

export type LayerPatch = Partial<
  Pick<LayerDefinition, "name" | "provider" | "source">
>;

function value(element: XmlElement, name: string): string {
  const child = findChild(element, name);
  return child ? getText(child) : "";
}

function put(element: XmlElement, name: string, text: string): void {
  let child = findChild(element, name);
  if (!child) {
    child = createElement(name);
    element.children.push(child);
  }
  setText(child, text);
}

/** A minimal definition; QGIS supplies extent and style defaults. */
export function createLayer(layer: LayerDefinition): XmlElement {
  if (!layer.id.trim())
    throw new QgsError("INVALID_EDIT", "A layer ID must not be empty");
  if (!layer.crs.trim())
    throw new QgsError(
      "INVALID_EDIT",
      "A layer CRS authority identifier must not be empty",
    );
  return createElement("maplayer", { type: layer.type }, [
    createElement("id", {}, [{ type: "text", value: layer.id }]),
    createElement(
      "layername",
      {},
      layer.name ? [{ type: "text", value: layer.name }] : [],
    ),
    createElement("datasource", {}, [{ type: "text", value: layer.source }]),
    createElement("provider", {}, [{ type: "text", value: layer.provider }]),
    createElement("srs", {}, [
      createElement("spatialrefsys", {}, [
        createElement("authid", {}, [{ type: "text", value: layer.crs }]),
      ]),
    ]),
  ]);
}

/** Returns live XML objects, so custom renderer/provider settings remain editable. */
export function getLayers(project: QgsProject): XmlElement[] {
  const container = findChild(project.root, "projectlayers");
  return container ? findChildren(container, "maplayer") : [];
}

/** Adds a definition and the matching tree/order references; returns the attached copy. */
export function addLayer(project: QgsProject, layer: XmlElement): XmlElement {
  if (layer.name !== "maplayer" || layer.type !== "element") {
    throw new QgsError(
      "INVALID_EDIT",
      "A layer definition must be a <maplayer> element",
    );
  }
  const id = value(layer, "id");
  if (
    !id.trim() ||
    getLayers(project).some((item) => value(item, "id") === id)
  ) {
    throw new QgsError("INVALID_EDIT", `Empty or duplicate layer ID: ${id}`);
  }
  const attached = structuredClone(layer);
  let container = findChild(project.root, "projectlayers");
  if (!container) {
    container = createElement("projectlayers");
    project.root.children.push(container);
  }
  let tree = findChild(project.root, "layer-tree-group");
  if (!tree) {
    tree = createElement("layer-tree-group", {
      name: "",
      checked: "Qt::Checked",
      expanded: "1",
    });
    project.root.children.push(tree);
  }
  container.children.push(attached);
  tree.children.push(
    createElement("layer-tree-layer", {
      id,
      name: value(attached, "layername"),
      source: value(attached, "datasource"),
      providerKey: value(attached, "provider"),
      checked: "Qt::Checked",
      expanded: "1",
    }),
  );
  const customOrder = findChild(tree, "custom-order");
  if (customOrder)
    customOrder.children.push(
      createElement("item", {}, [{ type: "text", value: id }]),
    );
  const layerOrder = findChild(project.root, "layerorder");
  if (layerOrder) layerOrder.children.push(createElement("layer", { id }));
  return attached;
}

/** Updates the maplayer and every matching nested layer-tree reference together. */
export function updateLayer(
  project: QgsProject,
  id: string,
  patch: LayerPatch,
): XmlElement {
  const matches = getLayers(project).filter((item) => value(item, "id") === id);
  const layer = matches[0];
  if (matches.length !== 1 || !layer) {
    throw new QgsError(
      "INVALID_EDIT",
      `Expected one layer with ID ${id}, found ${matches.length}`,
    );
  }
  const fields = [
    ["name", "layername", "name"],
    ["source", "datasource", "source"],
    ["provider", "provider", "providerKey"],
  ] as const;
  const tree = findChild(project.root, "layer-tree-group");
  const references: XmlElement[] = [];
  // Traverse only the layer tree, never similarly named plugin/layout content.
  const pending = tree ? [tree] : [];
  const seen = new Set<XmlElement>();
  while (pending.length) {
    const node = pending.pop();
    if (!node) break;
    if (seen.has(node)) throw new QgsError("INVALID_EDIT", "Cyclic layer tree");
    seen.add(node);
    if (node.name === "layer-tree-layer" && node.attributes.id === id)
      references.push(node);
    pending.push(
      ...findChildren(node).filter(
        (child) =>
          child.name === "layer-tree-group" ||
          child.name === "layer-tree-layer",
      ),
    );
  }
  for (const [field, tag, attribute] of fields) {
    const text = patch[field];
    if (text !== undefined) {
      put(layer, tag, text);
      for (const reference of references)
        reference.attributes[attribute] = text;
    }
  }
  return layer;
}
