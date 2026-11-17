import { QgsError } from "./errors.ts";
import { layerOrder } from "./order.generated.ts";
import type { XmlElement, XmlNode } from "./types.ts";
import { createElement, findChildren } from "./xml.ts";

/**
 * XML that qgserde does not model, kept with the object that owns it.
 *
 * Keys are paths of modeled elements relative to the owner's element: `""` is
 * the owner itself, `"srs/spatialrefsys"` a descendant, and `"name[1]"` the
 * second modeled sibling of that name. Plain data: edit, copy, or delete it
 * like any other property. Data at a path the model no longer writes is dropped.
 */
export interface QgsUnmodeled {
  [path: string]: QgsUnmodeledEntry;
}

/** Unmodeled attributes and child nodes of one modeled element. */
export interface QgsUnmodeledEntry {
  /** Attributes the model does not write. Modeled attributes take precedence. */
  attributes?: Record<string, string>;
  /** Child nodes in their stored order. */
  children?: QgsUnmodeledChild[];
}

/** An unmodeled child node and its position among modeled siblings. */
export interface QgsUnmodeledChild {
  /** Name of the modeled sibling element this node follows; absent when it comes first. */
  after?: string;
  /** The node, as an element tree, text, CDATA, comment, or processing instruction. */
  node: XmlNode;
}

const SEGMENT = /^([^/[\]]+)(?:\[(\d+)\])?$/u;

export function unmodeledPath(parent: string, name: string, index: number) {
  const segment = index ? `${name}[${index}]` : name;
  return parent ? `${parent}/${segment}` : segment;
}

function locate(root: XmlElement, path: string): XmlElement | undefined {
  let current: XmlElement | undefined = root;
  for (const segment of path ? path.split("/") : []) {
    const match = SEGMENT.exec(segment);
    if (!match)
      throw new QgsError("INVALID_EDIT", `Invalid unmodeled path: ${path}`);
    current = current && findChildren(current, match[1])[Number(match[2] ?? 0)];
  }
  return current;
}

function invalid(message: string): never {
  throw new QgsError("INVALID_EDIT", `Invalid unmodeled data: ${message}`);
}

function checkNode(node: unknown, depth = 0): XmlNode {
  if (depth > 512) invalid("excessively deep");
  if (node === null || typeof node !== "object") invalid("node");
  const value = node as Record<string, unknown>;
  switch (value.type) {
    case "element":
      if (
        typeof value.name !== "string" ||
        value.attributes === null ||
        typeof value.attributes !== "object" ||
        !Array.isArray(value.children)
      )
        invalid("element");
      for (const child of value.children) checkNode(child, depth + 1);
      return node as XmlNode;
    case "text":
    case "cdata":
    case "comment":
      if (typeof value.value !== "string") invalid(String(value.type));
      return node as XmlNode;
    case "instruction":
      if (typeof value.target !== "string" || typeof value.body !== "string")
        invalid("instruction");
      return node as XmlNode;
    default:
      return invalid("node type");
  }
}

/**
 * Add unmodeled data to an element written from the model. Unmodeled children
 * follow their recorded modeled sibling.
 */
export function mergeUnmodeled(
  element: XmlElement,
  unmodeled: QgsUnmodeled | undefined,
): XmlElement {
  if (unmodeled === undefined) return element;
  if (unmodeled === null || typeof unmodeled !== "object")
    invalid("expected an object");
  for (const [path, entry] of Object.entries(unmodeled)) {
    if (entry === null || typeof entry !== "object") invalid(path);
    const target = locate(element, path);
    // The model no longer writes this element, so its unmodeled data goes with it.
    if (!target) continue;
    for (const [name, value] of Object.entries(entry.attributes ?? {})) {
      if (typeof value !== "string") invalid(`attribute ${name}`);
      target.attributes[name] ??= value;
    }
    if (entry.children === undefined) continue;
    if (!Array.isArray(entry.children)) invalid(`${path} children`);
    const anchored = new Map<string | undefined, XmlNode[]>();
    for (const child of entry.children) {
      if (child === null || typeof child !== "object") invalid(path);
      if (child.after !== undefined && typeof child.after !== "string")
        invalid(`${path} after`);
      const node = structuredClone(checkNode(child.node));
      anchored.set(child.after, [...(anchored.get(child.after) ?? []), node]);
    }
    const last = new Map<string, XmlNode>();
    for (const node of target.children)
      if (node.type === "element") last.set(node.name, node);
    const children: XmlNode[] = [...(anchored.get(undefined) ?? [])];
    anchored.delete(undefined);
    for (const node of target.children) {
      children.push(node);
      if (node.type === "element" && last.get(node.name) === node) {
        children.push(...(anchored.get(node.name) ?? []));
        anchored.delete(node.name);
      }
    }
    // Anchors the model no longer writes: keep the nodes, at the end.
    for (const nodes of anchored.values()) children.push(...nodes);
    target.children = children;
  }
  return element;
}

/**
 * Order listed children by `order`; the k-th element of a name takes the k-th
 * listed position of that name. Unlisted nodes stay right after the node they
 * followed, so data unknown to the table keeps its neighbours.
 */
function sortChildren(element: XmlElement, order: readonly string[]): void {
  const seen = new Map<string, number>();
  const groups: { rank: number; nodes: XmlNode[] }[] = [
    { rank: -1, nodes: [] },
  ];
  for (const node of element.children) {
    const ranks =
      node.type === "element"
        ? order.flatMap((name, index) => (name === node.name ? [index] : []))
        : [];
    if (!ranks.length || node.type !== "element") {
      groups.at(-1)?.nodes.push(node);
      continue;
    }
    const occurrence = seen.get(node.name) ?? 0;
    seen.set(node.name, occurrence + 1);
    groups.push({
      rank: ranks[Math.min(occurrence, ranks.length - 1)] ?? order.length,
      nodes: [node],
    });
  }
  element.children = groups
    .map((group, index) => ({ ...group, index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .flatMap((group) => group.nodes);
}

/** Indent element-only content with two spaces per level, as QGIS does. */
export function indent(element: XmlElement, depth: number): XmlElement {
  const hasText = element.children.some(
    (node) =>
      (node.type === "text" && node.value.trim()) || node.type === "cdata",
  );
  const elements = element.children.some((node) => node.type === "element");
  if (hasText || !elements) return element;
  const pad = (level: number): XmlNode => ({
    type: "text",
    value: `\n${"  ".repeat(level)}`,
  });
  const children: XmlNode[] = [];
  for (const node of element.children) {
    if (node.type === "text") continue;
    children.push(pad(depth + 1));
    children.push(node.type === "element" ? indent(node, depth + 1) : node);
  }
  children.push(pad(depth));
  element.children = children;
  return element;
}

/** Copy an unmodeled element tree, dropping whitespace between elements. */
export function plainNode(node: XmlNode): XmlNode {
  if (node.type !== "element") return { ...node };
  const elements = node.children.some((child) => child.type === "element");
  return createElement(
    node.name,
    { ...node.attributes },
    node.children
      .filter(
        (child) => !(elements && child.type === "text" && !child.value.trim()),
      )
      .map(plainNode),
  );
}

/** Order the children of a `<maplayer>` as QGIS writes them. */
export function orderLayer(element: XmlElement, type: string): XmlElement {
  const key = type === "point-cloud" ? "pointcloud" : type;
  const order = Object.hasOwn(layerOrder, key) ? layerOrder[key] : undefined;
  if (order) sortChildren(element, order);
  return element;
}
