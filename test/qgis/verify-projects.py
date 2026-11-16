"""Read qgserde output in real QGIS; no external downloads or rendering required."""

import os
import sys
from pathlib import Path

from qgis.core import (
    Qgis,
    QgsApplication,
    QgsDataSourceUri,
    QgsFieldConstraints,
    QgsLayerTreeGroup,
    QgsMapLayer,
    QgsPalLayerSettings,
    QgsProject,
    QgsRasterDataProvider,
    QgsSingleBandGrayRenderer,
    QgsSymbol,
    QgsSymbolLayer,
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


def check_edited(project):
    check_memory(project)
    # Written from a QGIS 4 property tree; QGIS 3 needs element-named keys.
    assert project.readEntry("Measurement", "/DistanceUnits") == ("meters", True)
    assert project.readNumEntry("Gui", "/CanvasColorBluePart") == (255, True)


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


def prop(cls, name, scope="Property"):
    """Scoped enums replaced <Scope><Name> constants in later QGIS 3 releases."""
    legacy = getattr(cls, f"{scope}{name}", None)
    if legacy is None:
        legacy = getattr(cls, name, None)
    return legacy if legacy is not None else getattr(getattr(cls, scope), name)


def check_symbology(project):
    assert project.title() == "Symbology"
    layers = {layer.name(): layer for layer in project.mapLayers().values()}
    assert len(layers) == 5, sorted(layers)
    for layer in layers.values():
        assert layer.isValid(), layer.name()
        assert layer.renderer() is not None, ("missing renderer", layer.name())

    categorized = layers["categories"].renderer()
    assert categorized.type() == "categorizedSymbol", categorized.type()
    assert categorized.classAttribute() == "kind"
    categories = categorized.categories()
    assert [category.value() for category in categories] == ["park", 7], [
        category.value() for category in categories
    ]
    assert [category.renderState() for category in categories] == [True, False]
    assert categories[0].symbol().color().name() == "#00a000"
    second = categories[1].symbol()
    assert second.opacity() == 0.5, second.opacity()
    opacity = second.dataDefinedProperties().property(prop(QgsSymbol, "Opacity"))
    assert opacity.expressionString() == "50" and not opacity.isActive()
    assert categorized.sourceSymbol().color().name() == "#c8c8c8"
    ramp = categorized.sourceColorRamp()
    assert ramp.type() == "gradient" and ramp.color2().name() == "#0000ff"

    labeling = layers["categories"].labeling()
    assert layers["categories"].labelsEnabled()
    settings = labeling.settings()
    assert settings.fieldName == "upper(kind)" and settings.isExpression
    text = settings.format()
    assert text.size() == 11 and text.color().name() == "#c80000", text.size()
    assert text.buffer().enabled() and text.buffer().size() == 2
    assert text.background().enabled()
    marker = text.background().markerSymbol().symbolLayer(0)
    assert marker.shape() == Qgis.MarkerShape.Star
    assert settings.dist == 3
    assert settings.callout() and settings.callout().enabled()
    size = settings.dataDefinedProperties().property(prop(QgsPalLayerSettings, "Size"))
    assert size.isActive() and size.expressionString() == "12"
    rules = layers["rules"].labeling().rootRule().children()
    assert [rule.filterExpression() for rule in rules] == [
        "\"class\" = 'major'",
        "ELSE",
    ]
    assert rules[0].minimumScale() == 25000 and rules[0].settings().fieldName == "class"
    assert not rules[1].active() and rules[1].settings() is None

    graduated = layers["graduated"].renderer()
    assert graduated.type() == "graduatedSymbol", graduated.type()
    ranges = graduated.ranges()
    assert [(r.lowerValue(), r.upperValue()) for r in ranges] == [(0, 10), (10, 20)]
    marker = ranges[1].symbol().symbolLayer(0)
    assert marker.size() == 4, marker.size()
    size = marker.dataDefinedProperties().property(prop(QgsSymbolLayer, "Size"))
    assert size.isActive() and size.field() == "value"

    root = layers["rules"].renderer().rootRule()
    assert len(root.children()) == 1
    major = root.children()[0]
    assert major.filterExpression() == "\"class\" = 'major'"
    assert major.ruleKey() == "{major}" and major.minimumScale() == 100000
    assert major.symbol().symbolLayerCount() == 2
    assert major.symbol().symbolLayer(0).width() == 1.2
    sub = major.symbol().symbolLayer(1).subSymbol()
    assert sub and sub.symbolLayer(0).size() == 3, "missing marker line subsymbol"
    nested = major.children()
    assert len(nested) == 1 and nested[0].isElse() and not nested[0].active()

    single = layers["single"].renderer()
    assert single.type() == "singleSymbol" and single.usingSymbolLevels()
    assert not single.symbol().symbolLayer(0).enabled()
    assert single.symbol().color().name() == "#010203"
    assert layers["nothing"].renderer().type() == "nullSymbol"


def check_settings(project):
    layers = {layer.name(): layer for layer in project.mapLayers().values()}
    cities = layers["cities"]
    assert cities.isValid()
    fields = cities.fields()
    name = fields.indexOf("name")
    pop = fields.indexOf("pop")
    assert cities.attributeAlias(name) == "City name"
    setup = cities.editorWidgetSetup(pop)
    assert setup.type() == "Range" and setup.config()["Max"] == 1000, setup.config()
    assert cities.defaultValueDefinition(pop).expression() == "0"
    assert cities.defaultValueDefinition(pop).applyOnUpdate()
    constraints = fields.at(pop).constraints()
    assert constraints.constraintExpression() == '"pop" >= 0'
    assert constraints.constraintDescription() == "positive"
    unique = fields.at(fields.indexOf("id")).constraints()
    assert unique.constraints() & prop(
        QgsFieldConstraints, "ConstraintUnique", "Constraint"
    )
    config = cities.editFormConfig()
    assert config.readOnly(fields.indexOf("id"))
    assert config.labelOnTop(name) and config.reuseLastValue(name)
    assert config.initFunction() == "my_init" and "pass" in config.initCode()
    tabs = config.tabs()
    assert [tab.name() for tab in tabs] == ["Main"], [tab.name() for tab in tabs]
    children = tabs[0].children()
    assert [child.name() for child in children] == ["name", "Numbers"]
    assert children[1].children()[0].name() == "pop"
    assert cities.displayExpression() == '"name"'
    assert cities.mapTipTemplate() == "<b>[% name %]</b>"
    assert "pop_k" in [field.name() for field in cities.fields()]
    joins = cities.vectorJoins()
    assert len(joins) == 1 and joins[0].joinLayerId() == "countries_layer_01"
    assert joins[0].joinFieldNamesSubset() == ["cname"]
    assert [d.layerId() for d in cities.dependencies()] == ["countries_layer_01"]
    actions = cities.actions().actions()
    assert [a.name() for a in actions] == ["Say hi"]
    assert set(actions[0].actionScopes()) == {"Feature", "Canvas"}
    table = cities.attributeTableConfig()
    assert table.sortExpression() == '"pop"'
    assert [c.name for c in table.columns()][:2] == ["name", "pop"]
    assert table.columns()[1].hidden
    styles = cities.conditionalStyles()
    assert styles.rowStyles()[0].name() == "big"
    assert styles.fieldStyles("pop")[0].rule() == "@value > 10"
    assert cities.customProperty("plugin/key") == "value"
    assert cities.customProperty("plugin/count") == 3
    assert not cities.flags() & prop(QgsMapLayer, "Removable", "LayerFlag")
    assert cities.flags() & prop(QgsMapLayer, "Identifiable", "LayerFlag")
    server = cities.serverProperties()

    def served(name):
        # Server getters moved from the layer to its server properties in 3.38.
        return getattr(server if hasattr(server, name) else cities, name)()

    assert served("shortName") == "cities"
    assert served("keywordList").replace(" ", "") == "one,two"
    assert served("dataUrl") == "https://example.com/data"
    assert served("attributionUrl") == "https://example.com"
    metadata = cities.metadata()
    assert metadata.title() == "Cities metadata"
    assert metadata.keywords() == {"gmd:topicCategory": ["location"]}
    assert metadata.contacts()[0].email == "a@example.com"
    assert metadata.licenses() == ["CC-BY"] and metadata.history() == ["created"]
    assert cities.temporalProperties().isActive()
    assert cities.temporalProperties().startField() == "pop"
    assert cities.geometryOptions().geometryPrecision() == 0.01


def check_raster(project):
    layers = {layer.name(): layer for layer in project.mapLayers().values()}
    assert len(layers) == 5, sorted(layers)
    for layer in layers.values():
        assert layer.isValid(), (layer.name(), layer.error().summary())

    gray = layers["gray"]
    renderer = gray.renderer()
    assert renderer.type() == "singlebandgray", renderer.type()
    assert renderer.gradient() == prop(
        QgsSingleBandGrayRenderer, "WhiteToBlack", "Gradient"
    )
    enhancement = renderer.contrastEnhancement()
    assert enhancement.minimumValue() == 1 and enhancement.maximumValue() == 4
    assert gray.brightnessFilter().brightness() == 10
    assert gray.brightnessFilter().contrast() == 20
    assert gray.brightnessFilter().gamma() == 1.5
    assert gray.hueSaturationFilter().saturation() == -50
    assert gray.dataProvider().zoomedInResamplingMethod() == (
        QgsRasterDataProvider.ResamplingMethod.Bilinear
    )
    no_data = gray.dataProvider().userNoDataValues(1)
    assert [(r.min(), r.max()) for r in no_data] == [(1, 1)], no_data
    assert not gray.dataProvider().useSourceNoDataValue(1)

    pseudo = layers["pseudo"].renderer()
    assert pseudo.type() == "singlebandpseudocolor"
    shader = pseudo.shader().rasterShaderFunction()
    methods = getattr(Qgis, "ShaderInterpolationMethod", None)
    discrete = methods.Discrete if methods else shader.Discrete
    assert shader.colorRampType() == discrete
    items = shader.colorRampItemList()
    assert [(item.value, item.label) for item in items] == [(2, "low"), (4, "high")]
    assert items[1].color.alpha() == 128
    assert shader.sourceColorRamp().color2().name() == "#ff0000"

    paletted = layers["paletted"].renderer()
    assert paletted.type() == "paletted"
    assert [c.label for c in paletted.classes()] == ["one", "two"]
    assert paletted.classes()[1].color.name() == "#28323c"

    rgb = layers["rgb"].renderer()
    assert rgb.type() == "multibandcolor" and rgb.opacity() == 0.7
    assert (rgb.redBand(), rgb.greenBand(), rgb.blueBand()) == (3, 2, 1)
    assert rgb.redContrastEnhancement().maximumValue() == 4
    pixels = rgb.rasterTransparency().transparentThreeValuePixelList()
    assert len(pixels) == 1 and pixels[0].percentTransparent == 100

    hillshade = layers["hillshade"].renderer()
    assert hillshade.type() == "hillshade"
    assert (hillshade.azimuth(), hillshade.altitude(), hillshade.zFactor()) == (
        300,
        40,
        2,
    )


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
            ("edited.qgs", check_edited),
            ("gallery.qgs", check_gallery),
            ("gallery-roundtrip.qgs", check_gallery),
            ("symbology.qgs", check_symbology),
            ("symbology-roundtrip.qgs", check_symbology),
            ("settings.qgs", check_settings),
            ("settings-roundtrip.qgs", check_settings),
            ("raster.qgs", check_raster),
            ("raster-roundtrip.qgs", check_raster),
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
    print("QGIS verified 13 projects", flush=True)


if __name__ == "__main__":
    main()
