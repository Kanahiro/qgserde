import { readCrs, readExtent, text } from "./codec.ts";
import { QgsError } from "./errors.ts";
import {
  crsStrings,
  metadataTags,
  rasterAttributes,
  vectorAttributes,
} from "./schema.ts";
import type {
  QgsField,
  QgsLayerTreeNode,
  QgsMapLayer,
  QgsProject,
  XmlDeclaration,
  XmlDocument,
  XmlElement,
  XmlNode,
} from "./types.ts";
import { sameExtent } from "./view-codec.ts";
import { createElement, findChild, findChildren } from "./xml.ts";

type Property = {
  property: string[];
  origin?: true;
  field?: string;
  format?: "boolean" | "checkState" | "pointcloud";
};
type Value = string | Property;
type Layout = {
  kind: "element";
  name: string;
  attributes: Record<string, Value>;
  content: Content[];
  value?: Property;
  guard?: Property;
};
type Content =
  | Layout
  | {
      kind: "value";
      value: Value;
      offset?: number;
      length?: number;
      cdata?: true;
    }
  | { kind: "comment"; value: string }
  | { kind: "instruction"; target: string; body: string }
  | { kind: "doctype"; value: string }
  | { kind: "slot"; name: string; identity?: string };

/** Sparse extension values and placement instructions, rather than a source XML snapshot. */
export interface QgsExtensions {
  layout?: Layout;
  // Reference identities and comparison values are required for edits to shared references.
  origin?: Record<string, string>;
  declaration?: XmlDeclaration;
  before?: Content[];
  after?: Content[];
}

type Owner = { readonly extensions?: QgsExtensions };
type Binding = {
  attributes: Record<string, Property>;
  value?: Property;
  guard?: Property;
};

/** Source XML exists only during a single decode/encode operation. */
export class ExtensionCodec {
  private readonly active = new Set<Content>();
  private readonly sources = new Map<object, XmlElement>();
  private readonly bindings = new Map<XmlElement, Binding>();
  private readonly slots = new Map<
    XmlElement,
    Extract<Content, { kind: "slot" }>
  >();

  remember<T extends object>(owner: T, element: XmlElement): T {
    this.sources.set(owner, element);
    return owner;
  }

  source(owner: object): XmlElement | undefined {
    return this.sources.get(owner);
  }

  private bind(element: XmlElement): Binding {
    let binding = this.bindings.get(element);
    if (!binding) {
      binding = { attributes: {} };
      this.bindings.set(element, binding);
    }
    return binding;
  }

  private attribute(
    element: XmlElement | undefined,
    name: string,
    property: Property,
  ): void {
    if (element?.attributes[name] !== undefined)
      this.bind(element).attributes[name] = property;
  }

  private value(
    parent: XmlElement | undefined,
    name: string,
    property: Property,
  ): void {
    const element = parent && findChild(parent, name);
    // Nested markup is extension data, not a scalar. The writer must not erase it.
    if (element && !element.children.some((node) => node.type === "element"))
      this.bind(element).value = property;
  }

  private crs(
    parent: XmlElement | undefined,
    name: string,
    prefix: string[],
  ): void {
    const container = parent && findChild(parent, name);
    const srs = container && findChild(container, "spatialrefsys");
    if (container) this.bind(container).guard = { property: prefix };
    for (const [field, tag] of Object.entries(crsStrings))
      this.value(srs, tag, { property: [...prefix, field] });
    for (const [field, tag] of [
      ["srsId", "srsid"],
      ["srid", "srid"],
    ] as const)
      this.value(srs, tag, { property: [...prefix, field] });
    this.value(srs, "geographicflag", {
      property: [...prefix, "geographic"],
      format: "boolean",
    });
    this.attribute(srs, "nativeFormat", {
      property: [...prefix, "nativeFormat"],
    });
  }

  private extent(
    parent: XmlElement | undefined,
    name: string,
    prefix: string[],
  ): void {
    const element = parent && findChild(parent, name);
    if (element) this.bind(element).guard = { property: prefix };
    for (const coordinate of ["xmin", "ymin", "xmax", "ymax"]) {
      const property = { property: [...prefix, coordinate] };
      this.attribute(element, coordinate, property);
      this.value(element, coordinate, property);
    }
  }

  private content(node: XmlNode | XmlDocument["before"][number]): Content {
    if (node.type === "element") {
      const slot = this.slots.get(node);
      if (slot) return slot;
      const binding = this.bindings.get(node);
      const attributes: Record<string, Value> = Object.fromEntries(
        Object.entries(node.attributes).map(([name, value]) => [
          name,
          binding?.attributes[name] ?? value,
        ]),
      );
      const content: Content[] = [];
      const textNodes = node.children.filter(
        (child) => child.type === "text" || child.type === "cdata",
      );
      let offset = 0;
      for (const child of node.children) {
        if (
          binding?.value &&
          (child.type === "text" || child.type === "cdata")
        ) {
          const last = child === textNodes.at(-1);
          content.push({
            kind: "value",
            value: binding.value,
            offset,
            ...(last ? {} : { length: child.value.length }),
            ...(child.type === "cdata" ? { cdata: true as const } : {}),
          });
          offset += child.value.length;
        } else content.push(this.content(child));
      }
      if (binding?.value && textNodes.length === 0)
        content.push({ kind: "value", value: binding.value });
      return {
        kind: "element",
        name: node.name,
        attributes,
        content,
        ...(binding?.value ? { value: binding.value } : {}),
        ...(binding?.guard ? { guard: binding.guard } : {}),
      };
    }
    switch (node.type) {
      case "text":
        return { kind: "value", value: node.value };
      case "cdata":
        return { kind: "value", value: node.value, cdata: true };
      case "comment":
        return { kind: "comment", value: node.value };
      case "instruction":
        return { kind: "instruction", target: node.target, body: node.body };
      case "doctype":
        return { kind: "doctype", value: node.value };
    }
  }

  private capture(
    owner: Owner,
    element: XmlElement,
    origin?: Record<string, string>,
  ): void {
    const layout = this.content(element);
    if (layout.kind !== "element")
      throw new Error("An owner must have an element layout");
    Object.assign(owner, {
      extensions: { layout, ...(origin ? { origin } : {}) },
    });
  }

  private field(field: QgsField): void {
    const element = this.source(field);
    if (!element) return;
    this.attribute(element, "name", { property: ["name"], origin: true });
    this.attribute(findChild(element, "editWidget"), "type", {
      property: ["editorWidgetType"],
    });
    this.capture(field, element, { name: field.name });
    this.slots.set(element, {
      kind: "slot",
      name: "field",
      identity: field.name,
    });
  }

  private layer(layer: QgsMapLayer): void {
    const element = this.source(layer);
    if (!element) return;
    for (const [tag, field] of Object.entries({
      id: "id",
      layername: "name",
      datasource: "source",
      provider: "provider",
    }))
      this.value(element, tag, { property: [field], origin: true });
    this.attribute(element, "id", { property: ["id"], origin: true });
    // The XML spelling of a layer type is a format decision, not another stored value.
    this.attribute(element, "type", {
      property: [layer.type === "unknown" ? "xmlType" : "type"],
      ...(element.attributes.type?.toLowerCase() === "pointcloud"
        ? { format: "pointcloud" as const }
        : {}),
    });
    this.attribute(findChild(element, "provider"), "encoding", {
      property: ["providerEncoding"],
    });
    for (const [name, field] of Object.entries({
      minScale: "minScale",
      maxScale: "maxScale",
      hasScaleBasedVisibilityFlag: "scaleBasedVisibility",
    }))
      this.attribute(element, name, { property: [field] });
    this.value(element, "layerOpacity", { property: ["opacity"] });
    if (layer.crs) this.crs(element, "srs", ["crs"]);
    if (layer.extent) this.extent(element, "extent", ["extent"]);
    if (layer.type === "vector") {
      for (const key of ["geometry", "wkbType", "readOnly", "labelsEnabled"])
        this.attribute(element, key, { property: [key] });
      for (const field of layer.fields) this.field(field);
      for (const [container, tag, values] of [
        ["aliases", "alias", { name: "alias" }],
        [
          "defaults",
          "default",
          {
            expression: "defaultExpression",
            applyOnUpdate: "applyDefaultOnUpdate",
          },
        ],
      ] as const) {
        const parent = findChild(element, container);
        const seen = new Set<string>();
        if (parent)
          for (const record of findChildren(parent, tag)) {
            const name = record.attributes.field;
            if (
              name === undefined ||
              !layer.fields.some((field) => field.name === name)
            )
              continue;
            if (seen.has(name)) continue;
            seen.add(name);
            for (const [attribute, property] of Object.entries(values))
              this.attribute(record, attribute, {
                property: [property],
                field: name,
              });
          }
      }
      const renderer = findChild(element, "renderer-v2");
      for (const [field, attribute] of Object.entries(vectorAttributes))
        this.attribute(renderer, attribute, { property: ["renderer", field] });
    } else if (layer.type === "raster") {
      const pipe = findChild(element, "pipe");
      const renderer = pipe && findChild(pipe, "rasterrenderer");
      for (const [field, attribute] of Object.entries({
        type: "type",
        ...rasterAttributes,
      }))
        this.attribute(renderer, attribute, { property: ["renderer", field] });
    }
    this.capture(layer, element, {
      id: layer.id,
      name: layer.name,
      source: layer.source,
      provider: layer.provider,
    });
    this.slots.set(element, {
      kind: "slot",
      name: "maplayer",
      identity: layer.id,
    });
  }

  private tree(node: QgsLayerTreeNode): void {
    const element = this.source(node);
    if (!element) return;
    this.attribute(element, "expanded", { property: ["expanded"] });
    // Qt::Checked is a codec spelling; the normalized state is stored in the model.
    this.attribute(element, "checked", {
      property: ["checked"],
      format: "checkState",
    });
    if (node.type === "group") {
      this.attribute(element, "name", { property: ["name"] });
      for (const child of node.children) this.tree(child);
      const order = findChild(element, "custom-order");
      this.attribute(order, "enabled", {
        property: ["customOrder", "enabled"],
      });
      // Item IDs are stable identities for matching extension attributes after reordering.
    } else {
      this.attribute(element, "id", { property: ["layerId"] });
      for (const [attribute, property] of [
        ["name", "name"],
        ["source", "source"],
        ["providerKey", "provider"],
      ] as const)
        this.attribute(element, attribute, { property: [property] });
    }
    this.capture(node, element);
    this.slots.set(element, { kind: "slot", name: element.name });
  }

  captureProject(project: QgsProject, document: XmlDocument): void {
    for (const layer of project.layers) this.layer(layer);
    if (project.layerTree) this.tree(project.layerTree);
    const root = document.root;
    this.attribute(root, "version", { property: ["$version"] });
    for (const parent of [root, findChild(root, "projectMetadata")]) {
      const title = parent && findChild(parent, "title");
      if (title) this.value(parent, "title", { property: ["title"] });
    }
    this.attribute(root, "projectname", { property: ["title"] });
    const metadata = findChild(root, "projectMetadata");
    for (const [field, tag] of Object.entries(metadataTags))
      this.value(metadata, tag, { property: ["metadata", field] });
    if (project.crs) this.crs(root, "projectCrs", ["crs"]);
    else if (project.disabledCrs) this.crs(root, "projectCrs", ["disabledCrs"]);
    if (project.verticalCrs) this.crs(root, "verticalCrs", ["verticalCrs"]);
    this.attribute(findChild(root, "homePath"), "path", {
      property: ["homePath"],
    });
    const view = findChild(root, "ProjectViewSettings");
    const canvas = findChild(root, "mapcanvas");
    if (project.extent) {
      for (const [parent, tag, crsTag] of [
        [view, "DefaultViewExtent", "DefaultViewExtent"],
        [canvas, "extent", "destinationsrs"],
      ] as const) {
        if (!parent) continue;
        const extent = readExtent(parent, tag);
        if (!extent) continue;
        const crs = readCrs(parent, crsTag);
        const referenced = { ...extent, ...(crs ? { crs } : {}) };
        const prefix = sameExtent(referenced, project.extent)
          ? ["extent"]
          : ["legacyView", "extent"];
        this.extent(parent, tag, prefix);
        this.crs(parent, crsTag, [...prefix, "crs"]);
      }
    }
    if (view?.attributes.rotation !== undefined)
      this.attribute(view, "rotation", { property: ["rotation"] });
    if (canvas && text(canvas, "rotation") !== undefined)
      this.value(canvas, "rotation", {
        property:
          project.legacyView?.rotation === undefined
            ? ["rotation"]
            : ["legacyView", "rotation"],
      });
    this.capture(project, root);
    Object.assign(project.extensions ?? {}, {
      ...(document.declaration
        ? { declaration: { ...document.declaration } }
        : {}),
      before: document.before.map((node) => this.content(node)),
      after: document.after.map((node) => this.content(node)),
    });
    this.sources.clear();
    this.bindings.clear();
    this.slots.clear();
  }

  private resolve(
    owner: Owner,
    value: Value,
    version: string,
  ): string | undefined {
    if (typeof value === "string") return value;
    if (value.property[0] === "$version") return version;
    let current: unknown = owner;
    if (value.origin) current = owner.extensions?.origin;
    if (value.field) {
      const fields = (owner as QgsMapLayer & { fields?: QgsField[] }).fields;
      current = fields?.find(
        (field) =>
          (field.extensions?.origin?.name ?? field.name) === value.field,
      );
    }
    for (const key of value.property) {
      if (current === null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    if (current === undefined) return undefined;
    if (typeof current === "boolean")
      return value.format === "boolean" ? String(current) : current ? "1" : "0";
    if (value.format === "checkState") {
      if (current === "checked") return "Qt::Checked";
      if (current === "unchecked") return "Qt::Unchecked";
      if (current === "partial") return "Qt::PartiallyChecked";
    }
    if (value.format === "pointcloud" && current === "point-cloud")
      return "pointcloud";
    return String(current);
  }

  private inflate(
    owner: Owner,
    content: Content,
    version: string,
    depth = 0,
  ): XmlNode | XmlDocument["before"][number] | undefined {
    if (this.active.has(content) || depth > 512)
      throw new QgsError(
        "INVALID_EDIT",
        "Cyclic or excessively deep extension data",
      );
    this.active.add(content);
    try {
      switch (content.kind) {
        case "element": {
          if (
            (content.value &&
              this.resolve(owner, content.value, version) === undefined) ||
            (content.guard &&
              this.resolve(owner, content.guard, version) === undefined)
          )
            return undefined;
          const attributes: Record<string, string> = Object.fromEntries(
            Object.entries(content.attributes).flatMap(([key, value]) => {
              const resolved = this.resolve(owner, value, version);
              return resolved === undefined ? [] : [[key, resolved]];
            }),
          );
          const children = content.content.flatMap((child) => {
            const node = this.inflate(owner, child, version, depth + 1);
            return node && node.type !== "doctype" ? [node] : [];
          });
          return createElement(content.name, attributes, children);
        }
        case "value": {
          const value = this.resolve(owner, content.value, version);
          if (value === undefined) return undefined;
          const sliced = value.slice(
            content.offset ?? 0,
            content.length === undefined
              ? undefined
              : (content.offset ?? 0) + content.length,
          );
          return sliced || content.cdata
            ? { type: content.cdata ? "cdata" : "text", value: sliced }
            : undefined;
        }
        case "slot":
          return createElement(
            content.name,
            content.identity === undefined
              ? {}
              : content.name === "field"
                ? { name: content.identity }
                : { id: content.identity },
          );
        case "comment":
          return { type: "comment", value: content.value };
        case "instruction":
          return {
            type: "instruction",
            target: content.target,
            body: content.body,
          };
        case "doctype":
          return { type: "doctype", value: content.value };
        default:
          throw new QgsError(
            "INVALID_EDIT",
            "Unknown extension placement instruction",
          );
      }
    } finally {
      this.active.delete(content);
    }
  }

  private restore(
    owner: Owner,
    version: string,
    name: string,
  ): XmlElement | undefined {
    const layout = owner.extensions?.layout;
    if (!layout) {
      if (owner.extensions !== undefined)
        throw new QgsError(
          "INVALID_EDIT",
          "Extension placement data is missing",
        );
      return undefined;
    }
    if (layout.kind !== "element" || layout.name !== name)
      throw new QgsError(
        "INVALID_EDIT",
        `Expected extension placement data for ${name}`,
      );
    const root = this.inflate(owner, layout, version);
    if (root?.type !== "element") return undefined;
    this.sources.set(owner, root);
    return root;
  }

  restoreProject(project: QgsProject, version: string): XmlDocument {
    for (const layer of project.layers) {
      if (layer.type === "vector")
        for (const field of layer.fields) this.restore(field, version, "field");
      this.restore(layer, version, "maplayer");
    }
    const active = new Set<QgsLayerTreeNode>();
    const restoreTree = (group: QgsLayerTreeNode, depth = 1): void => {
      if (active.has(group) || depth > 512)
        throw new QgsError(
          "INVALID_EDIT",
          "Cyclic or excessively deep layer tree",
        );
      active.add(group);
      this.restore(
        group,
        version,
        group.type === "group" ? "layer-tree-group" : "layer-tree-layer",
      );
      if (group.type === "group")
        for (const child of group.children) restoreTree(child, depth + 1);
      active.delete(group);
    };
    if (project.layerTree) restoreTree(project.layerTree);
    const root =
      this.restore(project, version, "qgis") ?? createElement("qgis");
    const extensions = project.extensions;
    const misc = (
      items: Content[] = [],
      allowDoctype = true,
    ): XmlDocument["before"] =>
      items.flatMap((item) => {
        const node = this.inflate(project, item, version);
        if (!node) return [];
        if (
          node.type === "element" ||
          node.type === "cdata" ||
          (node.type === "doctype" && !allowDoctype)
        )
          throw new QgsError(
            "INVALID_EDIT",
            "Invalid extension data outside the project root",
          );
        return [node];
      });
    return {
      ...(extensions
        ? extensions.declaration
          ? { declaration: { ...extensions.declaration } }
          : {}
        : { declaration: { version: "1.0", encoding: "UTF-8" } }),
      before: misc(extensions?.before),
      root,
      after: misc(extensions?.after, false) as XmlDocument["after"],
    };
  }
}
