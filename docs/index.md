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
| `QgsProject`                              | Title, layers, CRS, view, layer tree, properties, relations, themes, and bookmarks.    |
| `QgsProjectMetadata`                      | Identifier, language, author, abstract, creation date, and other descriptive metadata. |
| `QgsCrs`                                  | Authority ID, WKT, PROJ definition, and QGIS CRS metadata.                             |
| `QgsRectangle` / `QgsReferencedRectangle` | Numeric bounds and an optional extent CRS.                                             |
| `QgsVectorLayer`                          | Common layer settings, geometry, labels, fields, and renderer.                         |
| `QgsVectorRenderer`                       | Single-symbol, categorized, graduated, rule-based, and null renderers.                 |
| `QgsVectorLabeling`                       | Simple and rule-based labeling, label settings, text formats, and callouts.            |
| `QgsSymbol` / `QgsSymbolLayer`            | Symbol layers, their properties, data-defined properties, and sub-symbols.             |
| `QgsRasterLayer`                          | Renderer, contrast, shader, palette, transparency, filters, resampling, and no-data.   |
| `QgsField`                                | Alias, editor widget and its settings, default value, constraints, and form behavior.  |
| `QgsMapLayerBase`                         | Flags, custom properties, blend mode, map tip, legend, time, elevation, and metadata.  |
| `QgsLayerTreeGroup` / `QgsLayerTreeLayer` | Groups, layer references, check states, drawing order, and node custom properties.     |

### Layers and fields

Check `layer.type` to narrow the `QgsMapLayer` union. Vector layers expose
`fields`; raster layers expose band settings through `renderer`. Other recognized
types each have their own interface (`QgsMeshLayer`, `QgsVectorTileLayer`,
`QgsPointCloudLayer`, `QgsPluginLayer`, `QgsAnnotationLayer`, `QgsGroupLayer`,
and `QgsTiledSceneLayer`); settings that are not modeled stay in extension data.
An unrecognized type becomes `QgsUnknownLayer`, with its
original type name in `xmlType`.

Vector tile layers model their basic renderer and labeling styles; mesh layers
their renderer settings (scalar shaders, mesh frames, averaging); annotation
layers their items with symbols and text formats (vector tile layers also their
tile matrix set); group layers their child
layer IDs; point cloud and tiled scene layers their renderers. The project's
main annotation layer, with its items, is `project.mainAnnotationLayer`.

Editor-widget identifiers and symbol layer classes remain strings because QGIS
plugins can extend them. Field settings affect the
project; they do not change the data source schema or feature values.

### Symbology

Check `renderer.type` to narrow `QgsVectorRenderer`. The discriminants are the
QGIS renderer names: `singleSymbol`, `categorizedSymbol`, `graduatedSymbol`,
`RuleRenderer`, `nullSymbol`, `heatmapRenderer`, `pointDisplacement`,
`pointCluster`, `invertedPolygonRenderer`, `mergedFeatureRenderer`, and
`25dRenderer`. Wrapper renderers hold the renderer they wrap in `renderer`.
Other renderers, such as plugin renderers, are `unknown`, with the QGIS name in
`xmlType`; their type-specific settings stay in extension data. Every renderer
can have a paint `effect`, an `orderBy` list, and data-defined properties;
symbol layers can have their own `effect`. Effect stacks list their effects in
`effects`.

```ts
if (layer.type === "vector" && layer.renderer?.type === "categorizedSymbol") {
  layer.renderer.categories.push({
    value: "park",
    label: "Park",
    render: true,
    symbol: {
      type: "fill",
      layers: [{ class: "SimpleFill", properties: { color: "0,160,0,255" } }],
    },
  });
}
```

Symbols are nested in the class or rule that uses them. The codec numbers
stored symbols and their references on every write, in the order QGIS uses.
QGIS gives each stored symbol to one class; a class without a symbol, or whose
symbol is already taken, is read without one and discarded by QGIS.

`QgsSymbolLayer.properties` holds class-specific settings with the keys QGIS
uses, such as `color` for `SimpleFill` or `line_width` for `SimpleLine`.
Colors are strings such as `"255,0,0,255"`. QGIS before 3.18 reads properties
only as `<prop>` elements; later versions read an `<Option>` map. The codec writes
the form the target reads and drops the redundant copy that QGIS 3.18 to 3.3x
also wrote. Nested property values cannot be written for targets before 3.18.

Data-defined properties are keyed by the QGIS property name, such as `size` or
`fillColor` for symbol layers and `alpha` for symbols. Each records `active`
and a `type`: 1 for a static `val`, 2 for a `field`, or 3 for an `expression`.

Property maps, data-defined properties, and other `<Option>` values use
`QgsVariant`: strings, numbers, booleans, `null`, arrays, and plain objects. An
unchanged kind of value keeps its stored QGIS type, such as `double` or `color`.
Values QGIS cannot express as plain data, such as CRS variants, read as `null`
and are kept as stored while they stay `null`. Category values keep their
stored type when QGIS would read the same value back; integers beyond the safe
JavaScript range stay strings.

Assign a new renderer object to change the renderer type. A renderer whose
`type` is changed in place keeps unmodeled data for the old type, which the new
type ignores.

Rule scale limits are denominators: `minScaleDenominator` is the most zoomed-in
scale and `maxScaleDenominator` the most zoomed-out one, as in QGIS's
`scalemindenom` and `scalemaxdenom`.

### Labeling

`layer.labelsEnabled` switches labels on; `layer.labeling` holds the settings.
Check `labeling.type` to narrow it: `simple` has one `settings` object, and
`rule-based` has a `rootRule` with nested `children`, like rule-based renderers.

```ts
if (layer.type === "vector") {
  layer.labelsEnabled = true;
  layer.labeling = {
    type: "simple",
    settings: {
      fieldName: "name",
      format: {
        style: { fontSize: 10, textColor: "0,0,0,255" },
        buffer: { bufferDraw: true, bufferSize: 1 },
      },
      placement: { placement: 1 },
    },
  };
}
```

QGIS label settings have well over a hundred options. Groups that QGIS stores
as element attributes are typed attribute groups (see
[Attribute groups](#attribute-groups)), such as `fontSize` in `format.style` or
`dist` in `placement`. Font families, tab positions, substitutions, background symbols, callouts, and
data-defined properties have their own structure. Effects and other unmodeled
children stay with the element that contains them.

### Raster rendering

`QgsRasterRenderer` keeps band numbers and opacity typed, and models the parts
each renderer type uses: contrast enhancements, min/max origin, a pseudocolor
`shader` with color `items`, a paletted `palette`, pixel `transparency`, and
legend settings. Settings QGIS stores as attributes, such as
`classificationMin`, are typed attribute groups; settings stored as child text,
such as `minValue`, are typed child-text groups. The layer's
`brightnessContrast`, `hueSaturation`, `resampler`, `resamplingStage`,
`providerResampling`, and per-band `noData` hold the other pipe stages.
Raster layers also model file-based `attributeTables` and, for QGIS 4, pixel
value `labeling`.

Removing an optional setting removes the element that stores it; a list stored
in its own container, such as `noData`, removes the container.

### Fields, forms, and other layer settings

QGIS stores per-field settings in layer-level lists keyed by field name. Each
`QgsField` collects them: alias, `editorWidgetType` and `editorWidgetConfig`,
default value, constraints and their strengths, split, duplicate, and merge
policies, `comment`, and `editable`, `labelOnTop`, and `reuseLastValue`.
Renaming a field renames all of its records.

Vector layers also model `diagram` renderers (pie, histogram, text, and
stacked `subRenderers`, with categories, their fields, and a data-defined size
legend) and `diagramSettings`, virtual `expressionFields`,
`joins`, data and layer
dependencies, `actions`, the attribute table, conditional styles, stored
expressions, the attribute `form` (including drag-and-drop `items` with
`container`, `field`, and other `kind`s), relation editor `widgets`, geometry
options, and relations kept with the layer.

Every layer type models its named style variants (`styles`): the current
style name and each variant's stored settings in `style`, with the same names
as on the layer, such as `renderer` and `labeling`. QGIS stores the current
variant empty because the layer itself holds it, and does not re-apply
`current` on load. Field settings inside variants stay in extension data.
Layers also model their 3D renderer (`renderer3d`: symbols with placement,
material, and edges; rules; categories), other `<maplayer>` attributes,
`flags`, `customProperties`, `blendMode`, map tip, `notes`, legend settings and
text on legend symbols, `temporal` and `elevation` settings, `metadata`
(including temporal extents), and `server` publishing settings, such as WMS
dimensions. Custom
properties are written as `<property>` elements for QGIS before 3.20, which
cannot store nested values, and as an `<Option>` map afterwards. QGIS writes
`<expressionfields>` twice; both copies are kept identical.

Adding a layer to `project.layers` adds a tree reference and an entry in any
existing drawing-order list when serialized. Removing a layer removes its tree
and order references. Editing its name, provider, or source updates matching
tree references. Unedited provider-generated values, such as UIDs, are retained.

Changing a layer ID updates tree and drawing-order references. It does not
update references inside relations, joins, layouts, or plugin settings. Keep
layer IDs stable in projects that use those features.

Layer IDs must have at least 11 UTF-16 code units. QGIS replaces
shorter IDs on load, leaving tree and drawing-order references unresolved, even
when the provider is valid. Serialization rejects these IDs with `INVALID_EDIT`.
This also applies to unchanged IDs read from XML. To repair a
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
read from XML is modeled as `project.disabledCrs`. An active `project.crs` takes
precedence over that stored definition. Both use the same CRS writer.
No geographic data or extent coordinates are reprojected.

If a CRS read from XML contains only an authority ID, serialization adds
the missing `srsid` lookup marker required by QGIS. Existing IDs, WKT and PROJ
definitions are preserved as modeled values. User-defined (`USER:`) IDs are not completed; serializing one without WKT or PROJ causes `INVALID_EDIT`.

`project.extent` can carry its own CRS in `extent.crs`. An extent without one
uses the project CRS. Rotation is clockwise, in degrees.

The codec writes the default extent to `ProjectViewSettings` for QGIS 3.10.1
and later, and rotation there for QGIS 3.28 and later. Older targets use
`mapcanvas`. Equivalent representations in the input stay synchronized;
independent view settings are modeled in `project.legacyView` and encoded from
those values. A target that cannot
represent both settings causes `INVALID_EDIT`.

Editing `project.title` updates the root title, metadata title, and
`projectname` attribute together.

QGIS 4 stores project properties as `<properties name="Key">`; QGIS 3 stores
them as `<Key>`. A QGIS 3 target rewrites QGIS 4 properties as element names.
If both forms of a key are present, the `name` form is used. A key that is
not a valid XML name cannot be written for QGIS 3 and causes `INVALID_EDIT`.
QGIS 4 targets keep the format of the input.

### Project settings

`project.properties` is the QGIS project property tree: nested keys holding
strings, numbers, booleans, and string lists, such as `Variables`,
`Measurement`, `Measure/Ellipsoid`, and the `WMS*` keys used by QGIS Server.
Stored value types are kept when the kind of value is unchanged. New keys use
the form of the tree they are added to, and QGIS 3 targets convert QGIS 4
named entries as before. `SpatialRefSys/ProjectionsEnabled` is not part of the
model; it follows `project.crs`.

The project also models its transaction mode and flags, relations and
polymorphic relations, map themes, bookmarks, the coordinate transform
context, snapping, server data-defined properties, elevation shading,
predefined scales, style, time, terrain, display, and GPS settings, map canvas
annotations, the QGIS 2 legend of older projects, other root attributes such as
`saveUser`, and
project metadata keywords, contacts, links, history, and dates. It also models
3D map views (`mapViews3D`) with their scene settings, camera, and animation;
`reports`; `sensors`; the preset full extent; labeling engine rules; and, for
QGIS 4.2, `elevationProfiles` and selective masking source sets. Layer-tree
nodes model their other attributes, such as `mutually-exclusive`, legend patch
shapes, and custom properties; QGIS 4.2 custom nodes have `type: "custom"`.

### Layouts

`project.layouts` lists print layouts. Each has its `pages`, `items`, and
`multiFrames` (such as attribute tables), atlas settings, guides, and custom
properties. A `QgsLayoutItem` has the QGIS item type number in `type` (for
example `65639` for maps and `65641` for labels) and its settings in
`attributes`, such as `labelText`, `position`, and `size`. Items also model
their colors, data-defined and custom properties, symbols, text formats, map
extents, CRS, locked layers and style overrides, label-blocking items, grids
and overviews, polyline nodes, group members, legend styles, trees, and map
filters, scale bar symbols and number formats, elevation profile and chart
plots, and 3D map scenes. Manual tables model their headers, cells, row
heights, and column widths. QGIS reads only the parts an item type uses.
Unmodeled item children stay with their item.

## Attribute groups

Settings that QGIS stores as attributes of one element, such as a text
buffer's `bufferSize` or a layout item's `positionLock`, are attribute groups.
Each group has a generated interface, such as `QgsTextBufferAttributes`, keyed
by the QGIS attribute name. Values are numbers, booleans, or strings, according
to how QGIS writes them; absent keys take QGIS defaults.

```ts
const buffer = settings.format.buffer;
if (buffer) {
  buffer.bufferDraw = true; // stored as 1
  buffer.bufferSize = 1.5;
}
```

Attributes a group does not type, and values that do not parse as their kind,
such as `nan`, are kept as text in `other`; they are written back unchanged.
A boolean keeps its stored `1`/`0` or `true`/`false` spelling, and an unchanged
number keeps its stored spelling, such as `1.0`. A key that is not part of the
group must go in `other`; anything else fails with `INVALID_EDIT`.
Namespace declarations (`xmlns:*`) are never part of a group.

The interfaces and their attribute kinds are generated from the QGIS 3.44 and
4.2 writers by `scripts/generate-attributes.py`; see CONTRIBUTING.md.

## Preserve data and order

The model separates known properties from unknown values, attributes,
namespaces, and element positions in internal `extensions`. Positions of known
items refer back to model properties. Small amounts of identity information
support reference updates. The original XML string and a complete XML tree are
not kept in the model.

Known settings always pass through the intermediate model and are reconstructed
on every write, even when unchanged. Parsed, JSON-restored, and new models use
the same validation and normalization rules. Unknown elements and their
parent–child relationships and order are preserved. Comments, CDATA, and processing instructions
are retained. Byte-for-byte reproduction is not guaranteed: numeric and boolean
spelling, quotes, empty-element syntax, entity notation, and XML line-ending
normalization may differ, though unchanged typed values keep their spelling.
Unknown strings, including leading zeros, remain
strings. Existing whitespace is kept; output is not automatically formatted.

Legacy aliases and defaults without field configuration become typed fields.
Duplicate alias/default records for the same field are rejected with
`INVALID_PROJECT`; missing alias names or default expressions become empty strings.
Operations that would erase unknown nested elements or collapse distinct view
settings fail with `INVALID_EDIT`.
Explicit removal of a modeled object removes that object's associated data.

Store models with `serializeJson` and restore them with `parseJson`:

```ts
import { parseJson, serializeJson } from "qgserde";

const saved = serializeJson(project);
const restored = parseJson(saved);
const xml = serializeQgs(restored, { version: "4.2" });
```

The output has the form `{"qgserde":"<version>","project":{...}}`. `parseJson`
accepts JSON written by a compatible qgserde version: the same major version,
or the same minor version before 1.0. Other versions cause `INVALID_VERSION`,
because the `extensions` format may change between them. Malformed JSON or a
missing envelope causes `INVALID_JSON`. The model itself is validated when it
is written with `serializeQgs`.

The internal `extensions` property holds the unknown data and order needed for
reconstruction and has no public editing API. Serialization does not mutate the
model, including when it fails.

## Choose an output version

Pass a QGIS 3 or 4 version to every `serializeQgs` call. `"3.40"` is normalized
to `"3.40.0"`; release names such as `"3.40.0-Bratislava"` and
`"4.2.0-Belém do Pará"` are accepted. Missing or malformed versions, and target
major versions other than 3 or 4, cause `INVALID_VERSION`.

The same model can be written for different versions, including after JSON
storage. Known properties are encoded for the requested target. Unmodeled
plugin settings and other unmodeled features are preserved without version
conversion. Choosing a version does not guarantee that the target QGIS
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
| `INVALID_JSON`    | Malformed JSON or a missing qgserde JSON envelope.                                                    |
| `INVALID_VERSION` | Invalid version syntax, a missing target, an unsupported target major version, or incompatible JSON.  |
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
