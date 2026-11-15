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
