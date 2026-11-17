import { MAX_CRS_DEPTH, readCrs, readExtent, text } from "./codec.ts";
import { QgsError } from "./errors.ts";
import { layerSpec } from "./layer-codec.ts";
import {
  projectMetadataSpec,
  projectSpec,
  treeNodeSpec,
  treeTags,
} from "./project-settings.ts";
import { crsStrings, fieldRecords, metadataTags } from "./schema.ts";
import { captureSpec, restoreSpec } from "./spec.ts";
import { captureRenderer, restoreRenderer } from "./symbology.ts";
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
import { bindVariant } from "./variant.ts";
import { sameExtent } from "./view-codec.ts";
import { createElement, findChild, findChildren } from "./xml.ts";

type Property = {
  property: string[];
  origin?: true;
  field?: string;
  /** Path from the owner to the field list `field` refers to; `fields` by default. */
  fieldsAt?: string[];
  format?: "boolean" | "checkState" | "pointcloud";
  /** Stored spelling of a number, such as `1.0`, kept while the value is unchanged. */
  text?: string;
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
  | {
      kind: "slot";
      name: string;
      identity?: string;
      attributes?: Record<string, string>;
    };

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

  /** Bind an attribute of a nested owner's element to a property path of that owner. */
  bindAttribute(
    element: XmlElement | undefined,
    name: string,
    path: string[],
    format?: "boolean",
    text?: string,
  ): void {
    this.attribute(element, name, {
      property: path,
      ...(format ? { format } : {}),
      ...(text === undefined ? {} : { text }),
    });
  }

  /** Bind a CRS container (`<name><spatialrefsys>`) to a property path. */
  bindCrs(parent: XmlElement, name: string, path: string[]): void {
    this.crs(parent, name, path);
  }

  /** Bind an extent element to a property path. */
  bindExtent(parent: XmlElement, name: string, path: string[]): void {
    this.extent(parent, name, path);
  }

  /** Bind an element's own text to a property path, unless it has nested markup. */
  bindElementText(element: XmlElement, path: string[]): void {
    if (!element.children.some((node) => node.type === "element"))
      this.bind(element).value = { property: path };
  }

  /** Bind the text of a scalar child element to a property path of its owner. */
  bindText(
    parent: XmlElement | undefined,
    name: string,
    path: string[],
    format?: "boolean",
    text?: string,
  ): void {
    this.value(parent, name, {
      property: path,
      ...(format ? { format } : {}),
      ...(text === undefined ? {} : { text }),
    });
  }

  /**
   * Capture a nested owner. Its children must already be captured. Slot
   * attributes identify the placeholder among siblings with the same name.
   */
  own(
    owner: object,
    element: XmlElement,
    attributes?: Record<string, string>,
  ): void {
    this.capture(owner, element);
    this.slots.set(element, {
      kind: "slot",
      name: element.name,
      ...(attributes ? { attributes } : {}),
    });
  }

  /** Restore a nested owner's element so its writer can start from it. */
  restoreOwner(owner: object, version: string, name: string): void {
    this.restore(owner, version, name);
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
    this.attribute(srs, "coordinateEpoch", {
      property: [...prefix, "coordinateEpoch"],
    });
    // Bind as deep as readCrs models, so deeper nesting stays literal.
    const depth = prefix.filter((key) => key === "topocentricBase").length;
    if (depth < MAX_CRS_DEPTH && srs && findChild(srs, "topocentricBaseCrs"))
      this.crs(srs, "topocentricBaseCrs", [...prefix, "topocentricBase"]);
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
    const editWidget = findChild(element, "editWidget");
    this.attribute(editWidget, "type", { property: ["editorWidgetType"] });
    const config = editWidget && findChild(editWidget, "config");
    const option = config && findChild(config, "Option");
    if (option)
      bindVariant(
        (target, name, path, format) =>
          this.attribute(target, name, {
            property: path,
            ...(format ? { format } : {}),
          }),
        option,
        ["editorWidgetConfig"],
      );
    this.attribute(element, "configurationFlags", {
      property: ["configurationFlags"],
    });
    this.capture(field, element, { name: field.name });
    this.slots.set(element, {
      kind: "slot",
      name: "field",
      identity: field.name,
    });
  }

  /**
   * Capture fields and the per-field records of `element`, a layer or a style
   * document. `path` leads from the owner to the field list.
   */
  captureFields(fields: QgsField[], element: XmlElement, path: string[]): void {
    for (const field of fields) this.field(field);
    const at = path.join("/") === "fields" ? {} : { fieldsAt: path };
    for (const table of fieldRecords) {
      const parent = findChild(element, table.container);
      const seen = new Set<string>();
      if (parent)
        for (const record of findChildren(parent, table.tag)) {
          const name = record.attributes[table.key];
          if (
            name === undefined ||
            seen.has(name) ||
            !fields.some((field) => field.name === name)
          )
            continue;
          seen.add(name);
          for (const [attribute, [property]] of Object.entries(table.values))
            this.attribute(record, attribute, {
              property: [property],
              field: name,
              ...at,
            });
        }
    }
  }

  /** Restore fields captured with {@link captureFields}. */
  restoreFields(fields: QgsField[], version: string): void {
    for (const field of fields) this.restore(field, version, "field");
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
      this.captureFields(layer.fields, element, ["fields"]);
      if (layer.renderer) captureRenderer(layer.renderer, this);
    }
    captureSpec(layerSpec(layer.type), layer as never, element, this, []);
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
    } else if (node.type === "custom") {
      this.attribute(element, "id", { property: ["id"] });
      this.attribute(element, "name", { property: ["name"] });
    } else {
      this.attribute(element, "id", { property: ["layerId"] });
      for (const [attribute, property] of [
        ["name", "name"],
        ["source", "source"],
        ["providerKey", "provider"],
      ] as const)
        this.attribute(element, attribute, { property: [property] });
    }
    captureSpec(treeNodeSpec(node.type), node as never, element, this, []);
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
    const metadataElement = findChild(root, "projectMetadata");
    if (metadataElement)
      captureSpec(
        projectMetadataSpec,
        project.metadata as never,
        metadataElement,
        this,
        ["metadata"],
      );
    captureSpec(projectSpec, project as never, root, this, []);
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
      let fields: unknown = owner;
      for (const key of value.fieldsAt ?? ["fields"])
        fields =
          fields && typeof fields === "object"
            ? (fields as Record<string, unknown>)[key]
            : undefined;
      current = (Array.isArray(fields) ? (fields as QgsField[]) : []).find(
        (field) =>
          (field.extensions?.origin?.name ?? field.name) === value.field,
      );
    }
    for (const key of value.property) {
      if (current === null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    if (current === undefined) return undefined;
    if (
      typeof current === "number" &&
      value.text !== undefined &&
      Number(value.text) === current
    )
      return value.text;
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
            content.attributes
              ? { ...content.attributes }
              : content.identity === undefined
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
      if (layer.type === "vector") {
        this.restoreFields(layer.fields, version);
        if (layer.renderer) restoreRenderer(layer.renderer, this, version);
      }
      restoreSpec(layerSpec(layer.type), layer as never, this, version, 0);
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
      restoreSpec(treeNodeSpec(group.type), group as never, this, version, 0);
      this.restore(group, version, treeTags[group.type]);
      if (group.type === "group")
        for (const child of group.children) restoreTree(child, depth + 1);
      active.delete(group);
    };
    if (project.layerTree) restoreTree(project.layerTree);
    if (project.metadata && typeof project.metadata === "object")
      restoreSpec(
        projectMetadataSpec,
        project.metadata as never,
        this,
        version,
        0,
      );
    restoreSpec(projectSpec, project as never, this, version, 0);
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
