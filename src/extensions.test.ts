import assert from "node:assert/strict";
import { test } from "node:test";
import { QgsError } from "./errors.ts";
import type { QgsExtensions } from "./extensions.ts";
import { ExtensionCodec } from "./extensions.ts";
import type { QgsProject } from "./types.ts";
import { findChild, getText, readXml } from "./xml.ts";

function project(extensions?: QgsExtensions): QgsProject {
  return {
    title: "ABC",
    metadata: {},
    layers: [],
    ...(extensions ? { extensions } : {}),
  };
}

test("remember associates source elements with owner identity", () => {
  const codec = new ExtensionCodec();
  const owner = project();
  const source = readXml("<qgis/>").root;
  assert.equal(codec.remember(owner, source), owner);
  assert.equal(codec.source(owner), source);
  assert.equal(codec.source(project()), undefined);
});

test("capture and JSON restoration preserve mixed content while resolving typed edits", () => {
  const document = readXml(
    '<?xml version="1.0"?><!--before--><!DOCTYPE qgis><qgis version="3.44.0" xmlns:p="urn:plugin"><title>A<!--keep--><![CDATA[B]]><?plugin keep?>C</title><p:config value="0001"/></qgis><!--after-->',
  );
  const owner = project();
  const codec = new ExtensionCodec();
  codec.remember(owner, document.root);
  codec.captureProject(owner, document);
  assert.equal(codec.source(owner), undefined);
  const stored: QgsProject = JSON.parse(JSON.stringify(owner));
  stored.title = "changed";
  const restoredCodec = new ExtensionCodec();
  const restored = restoredCodec.restoreProject(stored, "4.2.0");
  assert.equal(restored.root.attributes.version, "4.2.0");
  assert.deepEqual(restored.before, document.before);
  assert.deepEqual(restored.after, document.after);
  assert.deepEqual(
    findChild(restored.root, "p:config"),
    findChild(document.root, "p:config"),
  );
  const title = findChild(restored.root, "title")!;
  // Titles retain their source identity until the project writer synchronizes all title locations.
  assert.equal(getText(title), "ABC");
  assert.equal(restoredCodec.controls(title, "title"), true);
  assert.equal(restoredCodec.controls(restored.root, "$version"), true);
  assert.equal(restoredCodec.controls(undefined, "title"), false);
  assert.equal(
    restoredCodec.controls(findChild(restored.root, "p:config"), "title"),
    false,
  );
  assert.equal(restoredCodec.source(stored), restored.root);
});

test("missing optional properties remove their guarded containers", () => {
  const document = readXml(
    '<qgis version="4.2"><ProjectViewSettings rotation="10"><DefaultViewExtent xmin="1" ymin="2" xmax="3" ymax="4"/></ProjectViewSettings></qgis>',
  );
  const owner = project();
  owner.rotation = 10;
  owner.extent = { xmin: 1, ymin: 2, xmax: 3, ymax: 4 };
  const codec = new ExtensionCodec();
  codec.captureProject(owner, document);
  const stored: QgsProject = JSON.parse(JSON.stringify(owner));
  delete stored.rotation;
  delete stored.extent;
  const restored = new ExtensionCodec().restoreProject(stored, "4.2.0");
  const view = findChild(restored.root, "ProjectViewSettings")!;
  assert.equal(view.attributes.rotation, undefined);
  assert.equal(findChild(view, "DefaultViewExtent"), undefined);
});

test("fresh projects get a UTF-8 declaration and independent XML trees", () => {
  const codec = new ExtensionCodec();
  const owner = project();
  const first = codec.restoreProject(owner, "4.2.0");
  const second = codec.restoreProject(owner, "4.2.0");
  assert.deepEqual(first.declaration, { version: "1.0", encoding: "UTF-8" });
  first.root.attributes.plugin = "edited";
  assert.deepEqual(second.root.attributes, {});
  assert.equal(owner.extensions, undefined);
});

test("rejects missing and mismatched extension layouts", () => {
  for (const extensions of [
    {},
    { layout: { kind: "element", name: "other", attributes: {}, content: [] } },
  ] satisfies QgsExtensions[]) {
    assert.throws(
      () => new ExtensionCodec().restoreProject(project(extensions), "4.2.0"),
      (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
    );
  }
});

test("rejects illegal extension nodes outside the root", () => {
  const layout = {
    kind: "element" as const,
    name: "qgis",
    attributes: {},
    content: [],
  };
  for (const extensions of [
    {
      layout,
      before: [{ kind: "element", name: "extra", attributes: {}, content: [] }],
    },
    { layout, before: [{ kind: "value", value: "extra", cdata: true }] },
    { layout, after: [{ kind: "doctype", value: "qgis" }] },
  ] satisfies QgsExtensions[]) {
    assert.throws(
      () => new ExtensionCodec().restoreProject(project(extensions), "4.2.0"),
      (error) => error instanceof QgsError && error.code === "INVALID_EDIT",
    );
  }
});

test("rejects cyclic, excessively deep and unknown extension instructions", () => {
  const layout: NonNullable<QgsExtensions["layout"]> = {
    kind: "element",
    name: "qgis",
    attributes: {},
    content: [],
  };
  layout.content.push(layout);
  assert.throws(
    () => new ExtensionCodec().restoreProject(project({ layout }), "4.2.0"),
    /Cyclic/u,
  );
  layout.content = [];
  let current = layout;
  for (let depth = 0; depth <= 512; depth++) {
    const next: typeof layout = {
      kind: "element",
      name: "nested",
      attributes: {},
      content: [],
    };
    current.content.push(next);
    current = next;
  }
  assert.throws(
    () => new ExtensionCodec().restoreProject(project({ layout }), "4.2.0"),
    /excessively deep/u,
  );
  const malformed = JSON.parse(
    '{"layout":{"kind":"element","name":"qgis","attributes":{},"content":[{"kind":"future"}]}}',
  );
  assert.throws(
    () => new ExtensionCodec().restoreProject(project(malformed), "4.2.0"),
    /Unknown extension placement instruction/u,
  );
});
