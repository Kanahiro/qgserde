"""Read qgserde output in real QGIS; no external downloads or rendering required."""

import os
import sys
from pathlib import Path

from qgis.core import (
    Qgis,
    QgsApplication,
    QgsDataSourceUri,
    QgsLayerTreeGroup,
    QgsProject,
)


def check_memory(project):
    assert project.title() == "検証 & 地図", project.title()
    assert project.crs().isValid(), "invalid project CRS"
    assert project.crs().authid() == "EPSG:4326"
    assert project.viewSettings().defaultRotation() == 15
    extent = project.viewSettings().defaultViewExtent()
    assert extent.crs().isValid(), "invalid extent CRS"
    assert extent.xMinimum() == 140 and extent.yMaximum() == 45, extent.toString()
    assert extent.crs().authid() == "EPSG:4326"
    layers = list(project.mapLayers().values())
    assert len(layers) == 1, len(layers)
    assert layers[0].isValid(), "invalid memory layer"
    assert layers[0].name() == "都市"
    assert layers[0].crs().isValid(), "invalid memory layer CRS"
    assert layers[0].crs().authid() == "EPSG:4326"
    assert len(project.layerTreeRoot().findLayers()) == 1
    assert project.layerTreeRoot().findLayers()[0].layer(), (
        "dangling memory layer reference"
    )


def check_gallery(project):
    layers = list(project.mapLayers().values())
    assert len(layers) == 27, len(layers)
    assert project.crs().isValid(), "invalid gallery project CRS"
    assert project.crs().authid() == "EPSG:3857"
    vectors = 0
    for layer in layers:
        assert layer.isValid(), (layer.name(), layer.error().summary())
        assert layer.crs().isValid(), ("invalid layer CRS", layer.name())
        assert layer.crs().authid() == "EPSG:3857", layer.name()
        provider = layer.dataProvider()
        assert provider and provider.isValid(), layer.name()
        if layer.providerType() == "xyzvectortiles":
            vectors += 1
            uri = QgsDataSourceUri()
            uri.setEncodedUri(layer.source())
            assert uri.param("url").startswith("https://"), layer.source()
            assert all(part in uri.param("url") for part in ("{z}", "{x}", "{y}")), (
                layer.source()
            )
            assert uri.param("styleUrl").startswith(
                "https://tiles.openfreemap.org/styles/"
            )
            styles = layer.renderer().styles()
            assert len(styles) == 3, (layer.name(), len(styles))
            assert all(
                style.symbol() and style.symbol().symbolLayerCount() for style in styles
            )
            assert layer.tileMatrixSet().minimumZoom() == 0
            assert layer.tileMatrixSet().maximumZoom() == 14
        else:
            assert layer.providerType() == "wms", layer.providerType()
    assert vectors == 5, vectors
    tree = project.layerTreeRoot()
    references = tree.findLayers()
    assert len(references) > len(layers), "missing duplicate tree references"
    assert all(node.layer() for node in references), "dangling tree reference"
    assert {node.layerId() for node in references} == set(project.mapLayers())
    visible = [node.layerId() for node in references if node.isVisible()]
    assert visible == ["osm_standard"], visible

    def depth(group):
        children = [
            child for child in group.children() if isinstance(child, QgsLayerTreeGroup)
        ]
        return 1 + max((depth(child) for child in children), default=0)

    assert depth(tree) >= 5, "missing nested groups"


def check_wms(project):
    assert project.crs().isValid(), "invalid WMS project CRS"
    assert project.crs().authid() == "EPSG:6677"
    assert set(project.mapLayers()) == {"states_wms_layer"}
    layer = project.mapLayer("states_wms_layer")
    assert layer.isValid(), layer.error().summary()
    assert layer.providerType() == "wms"
    assert layer.dataProvider().isValid()
    assert layer.crs().isValid(), "invalid WMS layer CRS"
    assert layer.crs().authid() == "EPSG:3857"
    assert layer.renderer() and layer.renderer().type() == "singlebandcolordata"
    references = project.layerTreeRoot().findLayers()
    assert len(references) == 1
    assert references[0].layer() == layer, "dangling WMS tree reference"
    assert references[0].isVisible()
    assert references[0].parent().name() == "公開 WMS"


def main():
    directory = Path(sys.argv[1]).resolve()
    os.chdir(directory)
    expected = tuple(map(int, sys.argv[2].split(".")[:2]))
    actual = (Qgis.QGIS_VERSION_INT // 10000, Qgis.QGIS_VERSION_INT // 100 % 100)
    assert actual == expected, ("unexpected QGIS runtime", expected, Qgis.QGIS_VERSION)
    app = QgsApplication([], False)
    app.initQgis()
    try:
        for name, check in [
            ("generated.qgs", check_memory),
            ("converted.qgs", check_memory),
            ("edited.qgs", check_memory),
            ("gallery.qgs", check_gallery),
            ("gallery-roundtrip.qgs", check_gallery),
            ("wms.qgs", check_wms),
            ("wms-roundtrip.qgs", check_wms),
        ]:
            project = QgsProject()
            path = str(directory / name)
            assert project.read(path), ("failed to read", path)
            try:
                check(project)
                print(f"QGIS {Qgis.QGIS_VERSION}: {name} OK", flush=True)
            finally:
                project.clear()
        del project
    finally:
        app.exitQgis()
    print("QGIS verified 7 projects", flush=True)


if __name__ == "__main__":
    main()
