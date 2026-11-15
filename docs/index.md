# qgserde

Read, edit, and write QGIS project files in TypeScript.

qgserde exposes a typed model for `.qgs` XML. The model is independent of the
input QGIS version: choose a target version each time you serialize it. This
site covers the editing rules and the [public API](https://kanahiro.github.io/qgserde/modules.html).

## Read and edit a project

```ts
import { parseQgs, serializeQgs } from "qgserde";

const project = parseQgs(qgsXml);
project.title = "Sapporo";
project.crs = { authId: "EPSG:4326" };

for (const layer of project.layers) {
  layer.opacity = 0.8;
  if (layer.type === "vector") {
    layer.labelsEnabled = true;
    for (const field of layer.fields) field.alias = field.name;
  }
}

const qgis3Xml = serializeQgs(project, { version: "3.44" });
const qgis4Xml = serializeQgs(project, { version: "4.2" });
```

Your application handles file I/O. Pass decoded Unicode strings to `parseQgs`
and save the output of `serializeQgs` as UTF-8. An XML declaration, when present,
is written with UTF-8 encoding.

## Create a project

```ts
import { createProject, serializeQgs } from "qgserde";

const project = createProject({ title: "Cities" });
project.crs = { authId: "EPSG:4326" };
project.layers.push({
  type: "vector",
  id: "qgserde_cities_001",
  name: "Cities",
  provider: "ogr",
  source: "./cities.gpkg|layername=cities",
  crs: { authId: "EPSG:4326" },
  fields: [],
});

const xml = serializeQgs(project, { version: "4.2" });
```

`createProject()` returns an empty project with an empty title, metadata object,
layer array, and root tree group. Set `title` in the options object to give it a
name.

To start from an existing QGS file, use `parseQgs` and edit the resulting model:

```ts
const project = parseQgs(qgsXml);
project.title = "Regional map";
```

## Work with the model

`QgsProject` contains ordinary objects and arrays. Identifiers, expressions,
dates, and data source URIs are strings. Coordinates, scales, and opacity are
numbers; flags are booleans.

| Type                                      | Settings                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `QgsProject`                              | Title, layers, CRS, home path, default view, layer tree, and drawing order.            |
| `QgsProjectMetadata`                      | Identifier, language, author, abstract, creation date, and other descriptive metadata. |
| `QgsCrs`                                  | Authority ID, WKT, PROJ definition, and QGIS CRS metadata.                             |
| `QgsRectangle` / `QgsReferencedRectangle` | Numeric bounds and an optional extent CRS.                                             |
| `QgsVectorLayer`                          | Common layer settings, geometry, labels, fields, and renderer settings.                |
| `QgsRasterLayer`                          | Common layer settings, renderer opacity, and band selection.                           |
| `QgsField`                                | Name, editor widget, alias, default expression, and apply-on-update flag.              |
| `QgsLayerTreeGroup` / `QgsLayerTreeLayer` | Nested groups, layer references, check states, and custom drawing order.               |

### Layers and fields

Check `layer.type` to narrow the `QgsMapLayer` union. Vector layers expose
`fields`; raster layers expose band settings through `renderer`. Other recognized
types are `mesh`, `vector-tile`, `point-cloud`, `plugin`, `annotation`, `group`,
and `tiled-scene`. An unrecognized type becomes `QgsUnknownLayer`, with its
original type name in `xmlType`.

Renderer and editor-widget identifiers remain strings because QGIS plugins can
extend them. Detailed symbols, classification rules, label expressions,
relations, and layouts are held in extension data. Field settings affect the
project; they do not change the data source schema or feature values.

Adding a layer to `project.layers` adds a tree reference and an entry in any
existing drawing-order list when serialized. Removing a layer removes its tree
and order references. Editing its name, provider, or source updates matching
tree references. Unedited provider-generated values, such as UIDs, are retained.

Changing a layer ID updates tree and drawing-order references. It does not
update references inside relations, joins, layouts, or plugin settings. Keep
layer IDs stable in projects that use those features.

New or changed layer IDs must have at least 11 UTF-16 code units. QGIS replaces
shorter IDs on load, leaving tree and drawing-order references unresolved, even
when the provider is valid. Serialization rejects these IDs with `INVALID_EDIT`.
Unchanged IDs from parsed XML are preserved, including short IDs. To repair a
short ID, assign a longer one (for example, `"states_wms_layer"`); tree and order
references update on serialization.

### CRS and view settings

An authority ID is enough to assign a CRS:

```ts
project.crs = { authId: "EPSG:3857" };
```

Replace the CRS object when changing its definition so that old WKT or PROJ
values are not carried over. qgserde handles QGIS's CRS lookup conventions;
callers do not need its internal CRS database. Assigning `project.crs` also
enables project projection. Removing an active CRS disables it. A disabled CRS
read from XML stays in extension data rather than appearing in `project.crs`.
No geographic data or extent coordinates are reprojected.

`project.extent` can carry its own CRS in `extent.crs`. A new extent without one
uses the project CRS. Rotation is clockwise, in degrees.

The codec writes the default extent to `ProjectViewSettings` for QGIS 3.10.1
and later, and rotation there for QGIS 3.28 and later. Older targets use
`mapcanvas`. Equivalent representations in the input stay synchronized;
independent view settings retain their own values. A target that cannot
represent both settings causes `INVALID_EDIT`.

Editing `project.title` updates the root title, metadata title, and
`projectname` attribute together.

## Preserve data and order

The model separates known properties from unknown values, attributes,
namespaces, and element positions in internal `extensions`. Positions of known
items refer back to model properties. Small amounts of identity information
support reference updates. The original XML string and a complete XML tree are
not kept in the model.

Unedited values, parent–child relationships, and the order of repeated and
unknown elements are preserved. Comments, CDATA, and processing instructions
are retained. Byte-for-byte reproduction is not guaranteed: numeric and boolean
spelling, quotes, empty-element syntax, entity notation, and XML line-ending
normalization may differ. Unknown strings, including leading zeros, remain
strings. Existing whitespace is kept; output is not automatically formatted.

Operations that would erase unknown nested elements, claim conflicting
unmodeled records, or collapse distinct view settings fail with `INVALID_EDIT`.
Explicit removal of a modeled object removes that object's associated data.

Models can be stored as JSON:

```ts
const saved = JSON.stringify(project);
const restored = JSON.parse(saved);
const xml = serializeQgs(restored, { version: "4.2" });
```

Keep `extensions` in stored models. It holds the unknown data and order needed
for reconstruction and has no public editing API. A newly created empty
project needs no extension data. Serialization does not mutate the model,
including when it fails.

## Choose an output version

Pass a QGIS 3 or 4 version to every `serializeQgs` call. `"3.40"` is normalized
to `"3.40.0"`; release names such as `"3.40.0-Bratislava"` and
`"4.2.0-Belém do Pará"` are accepted. Missing or malformed versions, and target
major versions other than 3 or 4, cause `INVALID_VERSION`.

The same model can be written for different versions, including after JSON
storage. Known properties are encoded for the requested target. Unmodeled
plugin settings, renderer details, and other features are preserved without
version conversion. Choosing a version does not guarantee that the target QGIS
installation supports every feature in the project.

`parseQgisVersion` parses version syntax into `major`, `minor`, `patch`, and an
optional `suffix`. It defaults a missing patch to zero; the restriction to QGIS
3 and 4 is enforced by serialization.

## Handle errors

Catch `QgsError` and use its `code` to classify a failure. Messages provide
context and should not be used for branching.

```ts
import { parseQgs, QgsError } from "qgserde";

try {
  const project = parseQgs(qgsXml);
} catch (error) {
  if (error instanceof QgsError) console.error(error.code, error.message);
  else throw error;
}
```

| Code              | Meaning                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `INVALID_XML`     | Malformed XML, unsupported XML syntax, an internal DTD subset, or excessive depth.                    |
| `INVALID_PROJECT` | Invalid root, missing required attributes, or invalid modeled values.                                 |
| `INVALID_VERSION` | Invalid version syntax, a missing target, or an unsupported target major version.                     |
| `INVALID_EDIT`    | An edit that would lose data, duplicate IDs, cycles, non-finite numbers, or other invalid model data. |

## Scope and runtime

qgserde handles QGS XML strings. QGZ archives, QGD databases, attachments, and
geographic data are outside its scope. It does not check data source
availability or rewrite paths for another project location. It validates XML
and known properties, rather than the full QGIS schema.

Only XML 1.0 is supported. External DTDs are never fetched. Internal DTD
subsets, custom entities, cyclic structures, and XML deeper than 512 levels are
rejected.

The package is ESM and requires Node.js 24 or later. The library uses no Node.js
APIs or browser DOM; browser applications need a bundler and `structuredClone`.
For source setup and QGIS integration tests, see
[CONTRIBUTING.md](https://github.com/Kanahiro/qgserde/blob/main/CONTRIBUTING.md).

## License

qgserde is licensed under the GNU Affero General Public License, version 3 or
any later version ([AGPL-3.0-or-later](https://github.com/Kanahiro/qgserde/blob/main/LICENSE)).
Third-party material retains its original license; see the
[fixture sources and licenses](https://github.com/Kanahiro/qgserde/blob/main/test/fixtures/README.md).
