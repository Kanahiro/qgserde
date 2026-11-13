# qgserde

Read, edit, and write QGIS project files in TypeScript.

qgserde turns `.qgs` XML into a typed object. Edit project settings, layers,
fields, and the layer tree, then choose a QGIS 3 or 4 version when writing it
back. Settings outside the typed API retain their values, structure, and order.

[Documentation](https://kanahiro.github.io/qgserde/) ·
[API reference](https://kanahiro.github.io/qgserde/modules.html)

Pre-release. The API may change before the first release.

## Usage

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

const xml = serializeQgs(project, { version: "4.2" });
```

Input and output are strings. Your application reads and writes the files.

To start a new project:

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

const qgis3Xml = serializeQgs(project, { version: "3.44" });
const qgis4Xml = serializeQgs(project, { version: "4.2" });
```

`createProject()` also works without arguments and defaults to an empty title.
Use `parseQgs(xml)` to load an existing project, then edit its properties.

## API

| Export                               | Purpose                                                               |
| ------------------------------------ | --------------------------------------------------------------------- |
| `parseQgs(xml)`                      | Read QGS XML into a `QgsProject`.                                     |
| `createProject(options?)`            | Create an empty project with an optional title.                       |
| `serializeQgs(project, { version })` | Write a model for a QGIS 3 or 4 version.                              |
| `parseQgisVersion(value)`            | Split a QGIS version into numeric parts and an optional release name. |
| `QgsError`                           | Identify failures by their `code`.                                    |

The model contains plain objects and arrays. `QgsMapLayer` is a discriminated
union: checking `layer.type` gives access to vector fields, raster bands, or the
common settings of other layer types. See the [guide](https://kanahiro.github.io/qgserde/)
for editing rules and the full type reference.

## Data preservation

A parsed model stores known settings in typed properties and unknown data in
internal `extensions`, along with ordering and reference information. It does
not keep the original XML string or a complete XML tree as a backup.

Unedited values, parent–child relationships, and element order are preserved,
including unknown elements, attributes, namespaces, comments, and CDATA.
Numeric spelling, quotes, and entity syntax can change. Operations that would
erase unknown nested data or collapse distinct view settings fail with
`INVALID_EDIT`.

Models can be saved with `JSON.stringify` and restored with `JSON.parse`.
Keep `extensions` when doing so; removing it loses unknown data and order.
Serialization leaves the model unchanged, so it can be written repeatedly for
different target versions.

Known format differences are handled by the codec. Plugin settings, symbol
details, and other unmodeled features are preserved without version conversion.
The target QGIS installation must support those features.

## Scope

- QGS XML only. QGZ archives, QGD databases, attachments, and geographic data are
  outside the library's scope.
- File paths and data source URIs are kept as supplied. qgserde does not check
  whether a source exists or rewrite paths for a new project location.
- Layer ID edits update tree references and drawing order. References in
  relations, joins, layouts, or plugin settings are not updated; keep IDs stable
  in projects that use them.
- XML 1.0 only. External DTDs are never fetched. Internal DTD subsets, custom
  entities, cycles, and XML deeper than 512 levels are rejected.
- ESM. Node.js 24 or later; browser use requires a bundler and `structuredClone`.
  The library itself uses no Node.js APIs or browser DOM.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, documentation builds, and QGIS
integration tests. CI runs on Node.js 24 and 26 and opens generated projects in
QGIS 3.44, 4.0, and 4.2.

Fixture sources and their licenses are listed in
[test/fixtures/README.md](test/fixtures/README.md).
