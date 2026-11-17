import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createProject,
  parseJson,
  parseQgisVersion,
  parseQgs,
  QgsError,
  serializeJson,
  serializeQgs,
} from "../src/index.ts";
import type { XmlElement, XmlNode } from "../src/types.ts";
import {
  findChild,
  findChildren,
  getText,
  readXml,
  writeXml,
} from "../src/xml.ts";

// Only modeled numeric spellings may normalize; unknown strings such as "0001" stay exact.
function canonicalDocument(xml: string) {
  const document = readXml(xml);
  const tree = findChild(document.root, "layer-tree-group");
  if (tree)
    Object.assign(tree.attributes, {
      checked: tree.attributes.checked ?? "Qt::Checked",
      expanded: tree.attributes.expanded ?? "1",
      name: tree.attributes.name ?? "",
    });
  // A missing ProjectionsEnabled means disabled; the codec writes it in the
  // property format the project already uses.
  const properties = findChild(document.root, "properties");
  if (properties?.attributes.name !== undefined) {
    if (
      !findChildren(properties, "properties").some(
        (child) => child.attributes.name === "SpatialRefSys",
      )
    )
      properties.children.push(
        readXml(
          '<properties name="SpatialRefSys"><properties name="ProjectionsEnabled" type="int">0</properties></properties>',
        ).root,
      );
  } else if (properties && !findChild(properties, "SpatialRefSys"))
    properties.children.push(
      readXml(
        '<SpatialRefSys><ProjectionsEnabled type="int">0</ProjectionsEnabled></SpatialRefSys>',
      ).root,
    );
  // QGIS writes up to 20 significant digits; the codec writes the shortest
  // spelling of the same double.
  const extentText = (extent: XmlElement | undefined) => {
    for (const child of extent?.children ?? [])
      if (child.type === "element")
        for (const text of child.children)
          if (text.type === "text") text.value = String(Number(text.value));
  };
  // Graduated range bounds and layout map extents are written as the shortest
  // spelling of the double.
  const visit = (element: XmlElement) => {
    for (const child of findChildren(element)) {
      if (child.name === "wgs84extent") extentText(child);
      if (child.name === "Extent")
        for (const key of ["xmin", "ymin", "xmax", "ymax"])
          if (child.attributes[key] !== undefined)
            child.attributes[key] = String(Number(child.attributes[key]));
      if (child.name === "range")
        for (const key of ["lower", "upper"])
          if (child.attributes[key] !== undefined)
            child.attributes[key] = String(Number(child.attributes[key]));
      visit(child);
    }
  };
  visit(document.root);
  const canvas = findChild(document.root, "mapcanvas");
  extentText(canvas && findChild(canvas, "extent"));
  const settings = findChild(document.root, "ProjectViewSettings");
  const view = settings && findChild(settings, "DefaultViewExtent");
  for (const key of ["xmin", "ymin", "xmax", "ymax"])
    if (view?.attributes[key] !== undefined)
      view.attributes[key] = String(Number(view.attributes[key]));
  const layers = findChild(document.root, "projectlayers");
  if (layers)
    for (const layer of layers.children) {
      if (layer.type !== "element" || layer.name !== "maplayer") continue;
      for (const key of ["minScale", "maxScale"])
        if (layer.attributes[key] !== undefined)
          layer.attributes[key] = String(Number(layer.attributes[key]));
      extentText(findChild(layer, "extent"));
    }
  return document;
}

// The document outside <maplayer>, which keeps its structure and order.
function withoutLayers(xml: string) {
  const document = canonicalDocument(xml);
  const layers = findChild(document.root, "projectlayers");
  if (layers)
    layers.children = layers.children.filter(
      (node) => node.type !== "element" || node.name !== "maplayer",
    );
  return document;
}

// Layers are rebuilt from the model: whitespace, CDATA and numeric spelling
// normalize, and <maplayer> children follow the target QGIS writer order.
// ponytail: List/StringList normalize too; the variant model has no Qt type yet.
function layerContent(xml: string, sortChildren: boolean) {
  const value = (text: string) =>
    text.trim() !== "" && Number.isFinite(Number(text))
      ? String(Number(text))
      : text;
  const normalize = (node: XmlNode): XmlNode[] => {
    if (node.type === "text" || node.type === "cdata")
      return node.value ? [{ type: "text", value: value(node.value) }] : [];
    if (node.type !== "element") return [node];
    const attributes = Object.fromEntries(
      Object.entries(node.attributes).map(([key, text]) => [
        key,
        key === "type" && text === "StringList" ? "List" : value(text),
      ]),
    );
    const children = node.children.flatMap(normalize);
    const merged = children.some((child) => child.type === "element")
      ? children.filter((child) => child.type !== "text" || child.value.trim())
      : children;
    return [{ ...node, attributes, children: merged }];
  };
  const container = findChild(readXml(xml).root, "projectlayers");
  return (container ? findChildren(container, "maplayer") : []).map((layer) => {
    const [normalized] = normalize(layer) as [XmlElement];
    if (sortChildren)
      normalized.children.sort((a, b) =>
        JSON.stringify(a) < JSON.stringify(b) ? -1 : 1,
      );
    return normalized;
  });
}

test("deserializes a domain model instead of an arbitrary XML root", () => {
  const project = parseQgs(
    '<qgis version="4.2.0" projectname="old"><title>legacy</title><projectMetadata><title>metadata</title><author>keep</author></projectMetadata></qgis>',
  );
  assert.equal("version" in project, false);
  assert.equal(project.title, "metadata");
  assert.equal(project.metadata.author, "keep");
  assert.deepEqual(project.layers, []);
  assert.equal("root" in project, false);
  project.title = "新しい地図";
  project.metadata.author = "edited";
  const root = readXml(serializeQgs(project, { version: "4.2" })).root;
  assert.equal(getText(findChild(root, "title")!), "新しい地図");
  assert.equal(
    getText(findChild(findChild(root, "projectMetadata")!, "title")!),
    "新しい地図",
  );
  assert.equal(root.attributes.projectname, "新しい地図");
  assert.equal(
    parseQgs(serializeQgs(project, { version: "4.2" })).metadata.author,
    "edited",
  );
  project.title = "";
  assert.equal(parseQgs(serializeQgs(project, { version: "4.2" })).title, "");
});

test("creates one version-independent model and writes QGIS 3/4 formats", () => {
  const project = createProject({ title: "札幌 & 地図" });
  assert.equal("version" in project, false);
  const before = JSON.stringify(project);
  for (const [version, normalized] of [
    ["3.28", "3.28.0"],
    ["3.34.15-Prizren", "3.34.15-Prizren"],
    ["3.40", "3.40.0"],
    ["3.40.1", "3.40.1"],
    ["3.44", "3.44.0"],
    ["4.0", "4.0.0"],
    ["4.2.0-Belém do Pará", "4.2.0-Belém do Pará"],
  ] as const) {
    const xml = serializeQgs(project, { version });
    assert.equal(readXml(xml).root.attributes.version, normalized);
    const output = parseQgs(xml);
    assert.equal(output.title, project.title);
    assert.equal("version" in output, false);
    assert.deepEqual(output.layers, []);
  }
  assert.equal(JSON.stringify(project), before);
  for (const version of [
    "2.18",
    "5.0",
    "",
    "v3.40",
    "3",
    "3.40.x",
    "3.40.0.1",
    "03.40",
    "3.40-",
    "3.40.0 ",
    "999999999999999999999.0",
  ]) {
    assert.throws(
      () => serializeQgs(project, { version }),
      (error) => error instanceof QgsError && error.code === "INVALID_VERSION",
    );
  }
});

test("requires a qgis root and a valid source version", () => {
  for (const xml of ['<other version="3.40"/>', "<qgis/>"])
    assert.throws(
      () => parseQgs(xml),
      (error) => error instanceof QgsError && error.code === "INVALID_PROJECT",
    );
  assert.throws(
    () => parseQgs('<qgis version="unknown"/>'),
    (error) => error instanceof QgsError && error.code === "INVALID_VERSION",
  );
});

test("title edits retain unknown XML across output versions", () => {
  const xml = readFileSync(
    new URL("./fixtures/qgis4.qgs", import.meta.url),
    "utf8",
  )
    .replace("<qgis ", '<qgis xmlns:plugin="urn:plugin" plugin:setting="0001" ')
    .replace(
      "</qgis>",
      '<!--keep--><?plugin keep?><plugin:config flag="false"><![CDATA[unknown < value]]><item key="007"/></plugin:config></qgis>',
    );
  const source = parseQgs(xml);
  for (const title of [undefined, "新しい地図", ""]) {
    const project = parseQgs(xml);
    if (title !== undefined) project.title = title;
    assert.deepEqual(project, { ...source, title: title ?? source.title });
    const before = JSON.stringify(project);
    for (const version of ["3.44", "4.2"]) {
      const output = serializeQgs(JSON.parse(before), { version });
      const root = readXml(output).root;
      assert.equal(parseQgs(output).title, title ?? source.title);
      assert.equal(root.attributes["plugin:setting"], "0001");
      assert.deepEqual(
        findChild(root, "plugin:config"),
        findChild(readXml(xml).root, "plugin:config"),
      );
      assert.deepEqual(layerContent(output, false), layerContent(xml, false));
      assert.match(output, /<!--keep--><\?plugin keep\?>/u);
    }
    assert.equal(JSON.stringify(project), before);
    assert.deepEqual(project.extensions, source.extensions);
  }
});

test("writes a typed model without any source XML", () => {
  const project = { title: "generated", metadata: {}, layers: [] };
  const output = serializeQgs(project, { version: "4.2" });
  assert.equal(parseQgs(output).title, project.title);
  assert.equal("preservedXml" in project, false);
});

test("chooses extent and rotation storage independently for the target version", () => {
  for (const [version, extentTag, rotationTag] of [
    ["3.8", "mapcanvas", "mapcanvas"],
    ["3.10.0", "mapcanvas", "mapcanvas"],
    ["3.10.1", "ProjectViewSettings", "mapcanvas"],
    ["3.26", "ProjectViewSettings", "mapcanvas"],
    ["3.28", "ProjectViewSettings", "ProjectViewSettings"],
    ["4.2", "ProjectViewSettings", "ProjectViewSettings"],
  ] as const) {
    for (const setting of ["extent", "rotation", "both"]) {
      const project = createProject();
      project.crs = { authId: "EPSG:4326" };
      if (setting !== "rotation")
        project.extent = { xmin: 1, ymin: 2, xmax: 3, ymax: 4 };
      if (setting !== "extent") project.rotation = 15;
      const xml = serializeQgs(project, { version });
      const root = readXml(xml).root;
      if (project.extent) {
        const parent = findChild(root, extentTag)!;
        assert.ok(
          findChild(
            parent,
            extentTag === "mapcanvas" ? "extent" : "DefaultViewExtent",
          ),
        );
        assert.deepEqual(parseQgs(xml).extent, {
          ...project.extent,
          crs: { authId: "EPSG:4326", srsId: 1 },
        });
      }
      if (project.rotation !== undefined) {
        const parent = findChild(root, rotationTag)!;
        assert.equal(
          rotationTag === "mapcanvas"
            ? getText(findChild(parent, "rotation")!)
            : parent.attributes.rotation,
          "15",
        );
        assert.equal(parseQgs(xml).rotation, 15);
      }
    }
  }
});

test("reuses parsed and JSON-restored models across old and new formats without mutating them", () => {
  const original = createProject({ title: "independent" });
  original.crs = { authId: "EPSG:4326" };
  original.extent = {
    xmin: 1,
    ymin: 2,
    xmax: 3,
    ymax: 4,
    crs: { authId: "EPSG:3857" },
  };
  original.rotation = 15;
  for (const source of ["3.8", "3.10.1", "3.26", "3.28", "3.44", "4.2"]) {
    const xml = serializeQgs(original, { version: source }).replace(
      "</qgis>",
      '<plugin-data value="keep"><![CDATA[unknown]]></plugin-data></qgis>',
    );
    for (const project of [
      parseQgs(xml),
      JSON.parse(JSON.stringify(parseQgs(xml))),
    ]) {
      project.extent.xmin = -10;
      project.rotation = 45;
      const before = JSON.stringify(project);
      for (const version of ["4.2", "3.8", "3.26", "4.0", "3.44"]) {
        const output = serializeQgs(project, { version });
        const root = readXml(output).root;
        const result = parseQgs(output);
        assert.equal(result.title, "independent");
        assert.equal(result.rotation, 45);
        assert.deepEqual(
          JSON.parse(
            JSON.stringify(result.extent, (key, value) =>
              key === "extensions" ? undefined : value,
            ),
          ),
          JSON.parse(
            JSON.stringify(project.extent, (key, value) =>
              key === "extensions" ? undefined : value,
            ),
          ),
        );
        assert.deepEqual(result.crs, project.crs);
        assert.equal(getText(findChild(root, "plugin-data")!), "unknown");
        const parent = findChild(
          root,
          version === "3.8" ? "mapcanvas" : "ProjectViewSettings",
        )!;
        assert.ok(
          findChild(parent, version === "3.8" ? "extent" : "DefaultViewExtent"),
        );
        if (version === "3.8" || version === "3.26")
          assert.equal(
            getText(findChild(findChild(root, "mapcanvas")!, "rotation")!),
            "45",
          );
        else assert.equal(parent.attributes.rotation, "45");
        assert.equal(JSON.stringify(project), before);
      }
      delete project.extent;
      delete project.rotation;
      const removed = parseQgs(serializeQgs(project, { version: "3.8" }));
      assert.equal(removed.extent, undefined);
      assert.equal(removed.rotation, undefined);
    }
  }
});

test("a legacy extent keeps its own CRS when modern view settings contain other data", () => {
  const project = parseQgs(
    '<qgis version="3.26"><ProjectViewSettings><Scales/></ProjectViewSettings><mapcanvas><extent><xmin>1</xmin><ymin>2</ymin><xmax>3</xmax><ymax>4</ymax></extent><destinationsrs><spatialrefsys><authid>EPSG:3857</authid></spatialrefsys></destinationsrs></mapcanvas></qgis>',
  );
  assert.equal(project.extent?.crs?.authId, "EPSG:3857");
  assert.equal(
    parseQgs(serializeQgs(project, { version: "4.2" })).extent?.crs?.authId,
    "EPSG:3857",
  );
});

test("failed writes preserve the model and report missing target versions", () => {
  const project = createProject();
  const before = JSON.stringify(project);
  assert.throws(
    () => Reflect.apply(serializeQgs, undefined, [project]),
    (error) => error instanceof QgsError && error.code === "INVALID_VERSION",
  );
  project.rotation = Number.NaN;
  assert.throws(() => serializeQgs(project, { version: "3.8" }), /finite/u);
  delete project.rotation;
  assert.equal(JSON.stringify(project), before);
});

test("reads and edits typed CRS, extents, rotation and metadata", () => {
  const project = parseQgs(
    '<qgis version="4.2.0"><properties><SpatialRefSys><ProjectionsEnabled type="int">1</ProjectionsEnabled></SpatialRefSys></properties><projectCrs><spatialrefsys><authid>EPSG:4326</authid><geographicflag>true</geographicflag></spatialrefsys></projectCrs><ProjectViewSettings rotation="1e1"><DefaultViewExtent xmin="0" ymin="1" xmax="2" ymax="3"/></ProjectViewSettings></qgis>',
  );
  assert.equal(project.crs?.authId, "EPSG:4326");
  assert.equal(project.crs?.geographic, true);
  assert.deepEqual(project.extent, { xmin: 0, ymin: 1, xmax: 2, ymax: 3 });
  assert.equal(project.rotation, 10);
  project.crs = { authId: "EPSG:3857" };
  project.extent = {
    xmin: -100,
    ymin: -50,
    xmax: 100,
    ymax: 50,
    crs: { authId: "EPSG:3857" },
  };
  project.rotation = 45;
  project.homePath = "/maps";
  project.metadata.author = "author";
  const updated = parseQgs(serializeQgs(project, { version: "4.2" }));
  assert.equal(updated.crs!.authId, project.crs.authId);
  assert.equal(updated.extent!.xmin, project.extent.xmin);
  assert.equal(updated.extent!.xmax, project.extent.xmax);
  assert.equal(updated.extent!.crs!.authId, project.extent.crs!.authId);
  assert.equal(updated.rotation, 45);
  assert.equal(updated.homePath, "/maps");
  assert.equal(updated.metadata.author, "author");
  delete project.extent;
  delete project.crs;
  const removed = parseQgs(serializeQgs(project, { version: "4.2" }));
  assert.equal(removed.extent, undefined);
  assert.equal(removed.crs, undefined);
});

test("rejects invalid typed values before returning XML", () => {
  const project = createProject();
  project.rotation = Number.NaN;
  assert.throws(
    () => serializeQgs(project, { version: "4.2" }),
    (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
  );
  assert.throws(
    () =>
      parseQgs(
        '<qgis version="4.2.0"><ProjectViewSettings rotation="invalid"/></qgis>',
      ),
    (error) => error instanceof QgsError && error.code === "INVALID_PROJECT",
  );
});

test("active and disabled project CRS both pass through the CRS writer", () => {
  for (const enabled of ["0", "1"]) {
    const xml = `<qgis version="4.2.0"><projectCrs><spatialrefsys><authid>EPSG:4326</authid></spatialrefsys></projectCrs><properties><SpatialRefSys><ProjectionsEnabled type="int">${enabled}</ProjectionsEnabled></SpatialRefSys></properties></qgis>`;
    const project = parseQgs(xml);
    assert.equal(
      project.crs?.authId,
      enabled === "1" ? "EPSG:4326" : undefined,
    );
    const output = parseQgs(serializeQgs(project, { version: "4.2" }));
    assert.equal((output.crs ?? output.disabledCrs)?.srsId, 1);
    assert.equal(output.crs !== undefined, enabled === "1");
  }
});

// QGIS 4 writes <properties name="Key">, QGIS 3 writes <Key>. Releases after
// QGIS 4.2 ignore <Key> when a named sibling exists, so writes must use the
// project's own format and keep every copy in sync.
test("reads and writes ProjectionsEnabled in both QGIS property formats", () => {
  const crs =
    "<projectCrs><spatialrefsys><authid>EPSG:4326</authid></spatialrefsys></projectCrs>";
  const enabled = (xml: string) => {
    const properties = findChild(readXml(xml).root, "properties")!;
    return findChildren(properties).flatMap((spatial) =>
      findChildren(spatial)
        .filter(
          (value) =>
            value.attributes.name === "ProjectionsEnabled" ||
            value.name === "ProjectionsEnabled",
        )
        .map((value) => `${spatial.name}/${value.name}=${getText(value)}`),
    );
  };

  const named = `<qgis version="4.1.0">${crs}<properties name="properties"><properties name="SpatialRefSys"><properties name="ProjectCrs" type="QString">EPSG:4326</properties><properties name="ProjectionsEnabled" type="int">1</properties></properties></properties></qgis>`;
  const project = parseQgs(named);
  assert.equal(project.crs?.authId, "EPSG:4326");
  project.disabledCrs = project.crs!;
  delete project.crs;
  const disabled = serializeQgs(project, { version: "4.1" });
  assert.deepEqual(enabled(disabled), ["properties/properties=0"]);
  assert.equal(parseQgs(disabled).crs, undefined);
  // Sibling keys stay in place.
  assert.match(disabled, /<properties name="ProjectCrs" type="QString">/);

  // A named tree without the key gets a named entry, never a legacy element.
  const missing = parseQgs(
    `<qgis version="4.1.0">${crs}<properties name="properties"><properties name="Paths"><properties name="Absolute" type="bool">false</properties></properties></properties></qgis>`,
  );
  assert.equal(missing.crs, undefined);
  missing.crs = missing.disabledCrs!;
  delete missing.disabledCrs;
  const added = serializeQgs(missing, { version: "4.1" });
  assert.deepEqual(enabled(added), ["properties/properties=1"]);
  assert.equal(findChild(readXml(added).root, "SpatialRefSys"), undefined);
  assert.equal(parseQgs(added).crs?.authId, "EPSG:4326");

  // Files carrying both formats prefer the named entry and update both.
  const mixed = parseQgs(
    `<qgis version="4.3.0">${crs}<properties name="properties"><properties name="SpatialRefSys"><properties name="ProjectionsEnabled" type="int">1</properties></properties><SpatialRefSys><ProjectionsEnabled type="int">0</ProjectionsEnabled></SpatialRefSys></properties></qgis>`,
  );
  assert.equal(mixed.crs?.authId, "EPSG:4326");
  assert.deepEqual(enabled(serializeQgs(mixed, { version: "4.3" })), [
    "properties/properties=1",
    "SpatialRefSys/ProjectionsEnabled=1",
  ]);
});

test("QGIS 3 output rewrites QGIS 4 property keys as element names", () => {
  const xml = readFileSync(
    new URL("./fixtures/qgis4-translation.qgs", import.meta.url),
    "utf8",
  );
  const project = parseQgs(xml);
  const before = JSON.stringify(project);
  const output = serializeQgs(project, { version: "3.44" });
  assert.equal(JSON.stringify(project), before);
  const properties = findChild(readXml(output).root, "properties")!;
  const named: string[] = [];
  const visit = (element: XmlElement) => {
    for (const child of findChildren(element)) {
      // A key literally called "properties" is legal in both formats.
      if (child.name === "properties" && child.attributes.name !== undefined)
        named.push(child.attributes.name);
      visit(child);
    }
  };
  visit(properties);
  assert.deepEqual(named, []);
  assert.equal(properties.attributes.name, undefined);
  const measurement = findChild(properties, "Measurement")!;
  const distance = findChild(measurement, "DistanceUnits")!;
  assert.deepEqual(distance.attributes, { type: "QString" });
  assert.equal(getText(distance), "meters");
  // QStringList values keep their <value> children.
  const keywords = findChild(findChild(properties, "WMSKeywordList")!, "value");
  assert.ok(keywords);
  assert.equal(serializeQgs(parseQgs(output), { version: "3.44" }), output);
  // QGIS 4 output keeps the named format.
  assert.match(
    serializeQgs(project, { version: "4.1" }),
    /<properties name="Measurement">/,
  );

  // The named entry wins over a legacy copy of the same key.
  const mixed = serializeQgs(
    parseQgs(
      '<qgis version="4.3.0"><properties name="properties"><properties name="Paths"><properties name="Absolute" type="bool">true</properties><Absolute type="bool">false</Absolute></properties><Paths><Absolute type="bool">false</Absolute></Paths></properties></qgis>',
    ),
    { version: "3.44" },
  );
  const paths = findChildren(
    findChild(readXml(mixed).root, "properties")!,
    "Paths",
  );
  assert.equal(paths.length, 1);
  assert.deepEqual(
    findChildren(paths[0]!).map((child) => getText(child)),
    ["true"],
  );

  // Keys that are not XML names cannot be stored for QGIS 3.
  const invalid = parseQgs(
    '<qgis version="4.2.0"><properties name="properties"><properties name="my plugin"><properties name="a" type="int">1</properties></properties></properties></qgis>',
  );
  assert.throws(
    () => serializeQgs(invalid, { version: "3.44" }),
    (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
  );
  assert.match(
    serializeQgs(invalid, { version: "4.2" }),
    /<properties name="my plugin">/,
  );
});

for (const fixture of [
  "qgis3",
  "qgis3-custom-order",
  "qgis3-labeling",
  "qgis3-layer-types",
  "qgis3-layouts",
  "qgis3-project-settings",
  "qgis3-raster-styles",
  "qgis3-renderers",
  "qgis3-styles",
  "qgis3-vector-settings",
  "qgis3-raster",
  "qgis3-relations",
  "qgis3-view-settings",
  "qgis4",
  "qgis4-translation",
]) {
  test(`rebuilds an unmodified ${fixture} model and keeps its unmodeled data, including after JSON storage`, () => {
    const xml = readFileSync(
      new URL(`./fixtures/${fixture}.qgs`, import.meta.url),
      "utf8",
    );
    const project = parseQgs(xml);
    const version = readXml(xml).root.attributes.version!;
    const output = serializeQgs(project, { version });
    assert.deepEqual(withoutLayers(output), withoutLayers(xml));
    // Older QGIS versions wrote <maplayer> children in another order.
    const current = parseQgisVersion(version);
    const sameOrder = current.major > 3 || current.minor >= 10;
    assert.deepEqual(
      layerContent(output, !sameOrder),
      layerContent(xml, !sameOrder),
    );
    assert.equal(
      serializeQgs(parseJson(serializeJson(project)), { version }),
      output,
    );
    assert.equal(serializeQgs(parseQgs(output), { version }), output);
    const before = JSON.stringify(project);
    project.title = "edited";
    const edited = serializeQgs(project, { version });
    assert.equal(parseQgs(edited).title, "edited");
    // Serializing does not change the model.
    assert.equal(
      JSON.stringify({ ...project, title: "x" }),
      JSON.stringify({ ...JSON.parse(before), title: "x" }),
    );
  });
}

test("round trips a real upstream QGIS 3 project including styles, layer order and CRS", () => {
  const xml = readFileSync(
    new URL("./fixtures/qgis3.qgs", import.meta.url),
    "utf8",
  );
  const project = readXml(xml);
  assert.ok(project.root.attributes.version?.startsWith("3."));
  assert.deepEqual(readXml(writeXml(project)), project);
});
