# Fixtures

## wms-capabilities.xml

A minimal WMS 1.1.1 capabilities document authored for these tests. It is read
through a local file URL to check WMS layer validity and tree references without
network access. It advertises `OSM-WMS` but contains no OpenStreetMap data. The
verifier never requests map images from its placeholder GetMap URL.

## qgis3.qgs

An unmodified copy of
[`layer_rendering_order_qgis3_project.qgs`](https://github.com/qgis/QGIS/blob/release-3_44/tests/testdata/layer_rendering_order_qgis3_project.qgs)
from the QGIS repository, saved as `3.1.0-Master`.

Copyright QGIS contributors, GPL-2.0-or-later. The license text in
`QGIS-LICENSE.txt` is the upstream `COPYING` file. Tests use this fixture to
check XML preservation without opening its external data sources.

## Other upstream QGIS projects

Unmodified copies from the QGIS repository's `tests/testdata` at commit
[`59e30b5126`](https://github.com/qgis/QGIS/tree/59e30b51260ef53ea2109db4e5b3949bd1521660/tests/testdata).
Same copyright and license as `qgis3.qgs`. Tests only parse and write them; their
data sources are not opened.

| Fixture                   | Upstream file                                | Saved by       | Covers                                                                  |
| ------------------------- | -------------------------------------------- | -------------- | ----------------------------------------------------------------------- |
| `qgis3-custom-order.qgs`  | `qgis_server/bug_21917_root_layer_order.qgs` | 3.7.0-Master   | Custom layer order, nested group                                        |
| `qgis3-raster.qgs`        | `qgis_server_project/project.qgs`            | 3.2.0-Bonn     | Multiband raster, nested group                                          |
| `qgis3-relations.qgs`     | `projects/test-project-with-relations.qgs`   | 3.4.13-Madeira | Relations, edit widgets                                                 |
| `qgis3-view-settings.qgs` | `qgis_server/test_wfs_no_data.qgs`           | 3.35.0-Master  | `ProjectViewSettings` default extent                                    |
| `qgis4-translation.qgs`   | `project_translation/points_translation.qgs` | 4.1.0-Master   | Name-attributed `<properties>`, three-level groups, relations, metadata |

## qgis4.qgs

Generated with PyQGIS from QGIS `4.2.0-Belém do Pará`. It contains a project
named `QGIS 4 fixture` and an EPSG:4326 memory point layer named Sapporo. The
layer name is stored in Japanese to exercise Unicode handling. Save-user and
save-time attributes, and references to an external style database, were
removed.

To generate the project in a PyQGIS environment:

```python
from qgis.core import QgsApplication, QgsProject, QgsVectorLayer

app = QgsApplication([], False)
app.initQgis()
project = QgsProject()
project.setTitle("QGIS 4 fixture")
layer = QgsVectorLayer(
    "Point?crs=EPSG:4326&field=name:string", "\u672d\u5e4c", "memory"
)
project.addMapLayer(layer)
project.write("qgis4.qgs")
```

## qgis3-labeling.qgs

Generated with PyQGIS from QGIS `3.34.4-Prizren` (Ubuntu 24.04 package). It
contains two memory layers: `simple` with simple labeling (text buffer, marker
background shape, simple callout, and a data-defined size) and `rules` with
nested rule-based labeling, including an expression label and a disabled
`ELSE` rule.

## qgis3-raster-styles.qgs

Generated with PyQGIS from QGIS `3.34.4-Prizren` (Ubuntu 24.04 package) from a
2x2 ASCII grid and a three-band VRT of it, which are not committed. Layers use
single-band gray (contrast enhancement, brightness, hue/saturation, bilinear
provider resampling, user no-data), pseudocolor (gradient color ramp shader),
paletted, multiband color (per-band contrast, RGB transparency), and hillshade
renderers.

## qgis3-vector-settings.qgs

Generated with PyQGIS from QGIS `3.34.4-Prizren` (Ubuntu 24.04 package). Two
memory layers, `cities` and `countries`, with a relation between them. `cities`
has an alias, a default value, editor widgets, constraints, split policies,
read-only, label-on-top and reuse-last-value fields, a virtual field, a join, a
data dependency, an action, attribute table and conditional styles, a tabbed
drag-and-drop form with Python init code, a display expression, a map tip,
custom properties, server URLs and keywords, layer metadata, temporal and
elevation settings, and geometry options.

## qgis3-project-settings.qgs

Generated with PyQGIS from QGIS `3.34.4-Prizren` (Ubuntu 24.04 package). Two
memory layers and a mutually exclusive group with a custom property, project
variables, WMS properties, ellipsoid and units, transaction mode and flags,
snapping, a coordinate operation, a relation, a map theme, a bookmark, time
settings, predefined scales, project metadata, display and style settings.

## qgis3-renderers.qgs

Generated with PyQGIS from QGIS `3.34.4-Prizren` (Ubuntu 24.04 package). Memory
layers use heatmap, point displacement (embedding a categorized renderer),
point cluster, inverted polygon, 2.5D, and merged feature renderers, and a
single-symbol renderer with an order-by clause and paint effect stacks on the
renderer and its symbol layer.

## qgis3-layer-types.qgs

Generated with PyQGIS from QGIS `3.34.4-Prizren` (Ubuntu 24.04 package): an XYZ
vector tile layer with a basic renderer style and labeling style, a mesh layer
read from a one-quad 2DM file (not committed) with a native mesh frame, an
annotation layer with point text, marker, and line items, and a group layer
with a memory child layer.

## qgis3-layouts.qgs

Generated with PyQGIS from QGIS `3.34.4-Prizren` (Ubuntu 24.04 package): a
print layout with a map (grid, locked layer set), label, legend, scale bar,
picture, shape, polyline, an attribute table with one frame, an enabled atlas,
and a custom property.
