"""Read qgserde output in real QGIS; no external downloads or rendering required."""

import os
import sys
from pathlib import Path

try:
    from qgis._3d import (
        Qgs3D,
        Qgs3DMapSettings,
        QgsPolygon3DSymbol,
        QgsVectorLayer3DRenderer,
    )
except ImportError:  # QGIS built without 3D
    Qgs3D = None

from qgis.core import (
    Qgis,
    QgsApplication,
    QgsCoordinateReferenceSystem,
    QgsDataSourceUri,
    QgsExpressionContextUtils,
    QgsFieldConstraints,
    QgsLayerNotesUtils,
    QgsLayerTreeGroup,
    QgsLayoutItemShape,
    QgsMapLayer,
    QgsPalLayerSettings,
    QgsProject,
    QgsRasterDataProvider,
    QgsReadWriteContext,
    QgsSingleBandGrayRenderer,
    QgsSymbol,
    QgsSymbolLayer,
)
from qgis.PyQt import sip
from qgis.PyQt.QtXml import QDomDocument


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
    assert len(layers) == 9, sorted(layers)
    for layer in layers.values():
        assert layer.isValid(), layer.name()
        assert layer.renderer() is not None, ("missing renderer", layer.name())

    heatmap = layers["heatmap"].renderer()
    assert heatmap.type() == "heatmapRenderer" and heatmap.radius() == 15
    assert heatmap.weightExpression() == '"v"'
    assert heatmap.colorRamp().color2().name() == "#ff0000"
    cluster = layers["cluster"].renderer()
    assert cluster.type() == "pointCluster" and cluster.tolerance() == 5
    assert cluster.embeddedRenderer().type() == "singleSymbol"
    assert cluster.embeddedRenderer().symbol().color().name() == "#00ff00"
    assert cluster.clusterSymbol().color().name() == "#0000ff"
    inverted = layers["inverted"].renderer()
    assert inverted.type() == "invertedPolygonRenderer"
    assert inverted.preprocessingEnabled()
    assert inverted.embeddedRenderer().type() == "singleSymbol"
    effects = layers["effects"].renderer()
    assert effects.orderByEnabled()
    clause = effects.orderBy().list()[0]
    assert clause.expression().expression() == '"v"' and not clause.ascending()
    stack = effects.paintEffect()
    assert [e.type() for e in stack.effectList()] == ["dropShadow", "drawSource"]
    assert stack.effect(0).blurLevel() == 3
    layer_stack = effects.symbol().symbolLayer(0).paintEffect()
    assert [e.type() for e in layer_stack.effectList()] == ["outerGlow", "drawSource"]

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
    buffer_effect = text.buffer().paintEffect()
    assert [e.type() for e in buffer_effect.effectList()] == [
        "dropShadow",
        "drawSource",
    ]
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
    legend = graduated.dataDefinedSizeLegend()
    assert legend is not None and legend.title() == "Sizes"
    assert [c.label for c in legend.classes()] == ["small", "large"]
    assert legend.textColor().name() == "#ff0000"
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
    if hasattr(server, "wmsDimensions"):
        dimensions = server.wmsDimensions()
        assert [d.name for d in dimensions] == ["population"], dimensions
        assert dimensions[0].fieldName == "pop"
    assert QgsLayerNotesUtils.layerNotes(cities) == "<p>Checked</p>"
    legend = cities.legend()
    if hasattr(legend, "textOnSymbolContent"):
        assert legend.textOnSymbolContent() == {"0": "C"}, legend.textOnSymbolContent()
    metadata = cities.metadata()
    assert metadata.title() == "Cities metadata"
    assert metadata.keywords() == {"gmd:topicCategory": ["location"]}
    assert metadata.contacts()[0].email == "a@example.com"
    assert metadata.licenses() == ["CC-BY"] and metadata.history() == ["created"]
    periods = metadata.extent().temporalExtents()
    assert [p.begin().date().year() for p in periods] == [2020, 2022], periods
    assert periods[0].end().date().year() == 2021 and periods[1].isInstant()
    assert cities.temporalProperties().isActive()
    assert cities.temporalProperties().startField() == "pop"
    assert cities.geometryOptions().geometryPrecision() == 0.01
    diagram = cities.diagramRenderer()
    assert diagram.rendererName() == "SingleCategory", diagram.rendererName()
    category = diagram.diagramSettings()[0]
    assert category.enabled and category.categoryLabels == ["Population", "ID"]
    assert category.categoryColors[0].name() == "#ff0000"
    assert cities.diagramLayerSettings().priority() == 5
    assert cities.selectionProperties().selectionColor().name() == "#ff00ff"
    if Qgs3D:
        renderer3d = layers["countries"].renderer3D()
        assert renderer3d is not None and renderer3d.type() == "vector"
        # The bindings return the abstract base classes.
        renderer3d = sip.cast(renderer3d, QgsVectorLayer3DRenderer)
        symbol3d = sip.cast(renderer3d.symbol(), QgsPolygon3DSymbol)
        assert symbol3d.extrusionHeight() == 10, symbol3d.extrusionHeight()
        assert symbol3d.edgesEnabled() and symbol3d.edgeWidth() == 2
        assert symbol3d.materialSettings().diffuse().name() == "#ff0000"
    stacked = layers["countries"].diagramRenderer()
    if hasattr(stacked, "renderers"):  # QGIS 3.40+
        assert stacked.rendererName() == "Stacked", stacked.rendererName()
        names = [r.diagramSettings()[0].categoryLabels for r in stacked.renderers()]
        assert names == [["first"], ["second"]], names


def check_project_settings(project):
    assert project.title() == "Project settings"
    scope = QgsExpressionContextUtils.projectScope(project)
    assert scope.variable("city") == "Sapporo" and scope.variable("zoom") == "12"
    assert project.readEntry("WMSServiceTitle", "/") == ("My service", True)
    crs_list, ok = project.readListEntry("WMSCrsList", "/")
    assert ok and crs_list == ["EPSG:3857", "EPSG:4326"], crs_list
    assert project.ellipsoid() == "EPSG:7030"
    assert project.distanceUnits() == Qgis.DistanceUnit.Kilometers
    assert project.transactionMode() == Qgis.TransactionMode.AutomaticGroups
    assert project.flags() & Qgis.ProjectFlag.EvaluateDefaultValuesOnProviderSide
    relation = project.relationManager().relation("lines_points")
    assert relation.isValid(), "invalid relation"
    assert relation.fieldPairs() == {"pid": "id"}
    themes = project.mapThemeCollection()
    assert themes.mapThemes() == ["Only points"]
    assert themes.mapThemeVisibleLayerIds("Only points") == ["points_layer_0001"]
    bookmarks = project.bookmarkManager().bookmarks()
    assert [b.name() for b in bookmarks] == ["Home"]
    assert bookmarks[0].extent().crs().authid() == "EPSG:4326"
    assert bookmarks[0].extent().xMaximum() == 3 and bookmarks[0].rotation() == 10
    operation = project.transformContext().calculateCoordinateOperation(
        QgsCoordinateReferenceSystem("EPSG:4326"),
        QgsCoordinateReferenceSystem("EPSG:3857"),
    )
    assert operation == "+proj=pipeline +step +proj=noop", operation
    snapping = project.snappingConfig()
    assert snapping.enabled() and snapping.tolerance() == 20
    assert project.viewSettings().useProjectScales()
    assert sorted(project.viewSettings().mapScales()) == [1000, 5000]
    # The views manager exposes no getters to Python; read the stored view.
    document = QDomDocument()
    with open(project.fileName(), encoding="utf-8") as file:
        assert document.setContent(file.read())
    docks = document.documentElement().firstChildElement("mapViewDocks3D")
    view = docks.firstChildElement("view")
    assert view.attribute("name") == "3D Map 1"
    if Qgs3D:
        scene = Qgs3DMapSettings()
        scene.readXml(view.firstChildElement("qgis3d"), QgsReadWriteContext())
        scene.resolveReferences(project)
        assert scene.fieldOfView() == 50, scene.fieldOfView()
        assert scene.backgroundColor().name() == "#0a141e"
        assert [layer.id() for layer in scene.layers()] == ["points_layer_0001"]
        assert scene.eyeDomeLightingEnabled()
        assert len(scene.lightSources()) == 1
    sensors = project.sensorManager().sensors()
    assert [s.name() for s in sensors] == ["GPS feed"], sensors
    assert sensors[0].type() == "tcp_socket"
    if hasattr(project, "elevationProfileManager"):  # QGIS 4.2+
        profiles = project.elevationProfileManager().profiles()
        assert [p.name() for p in profiles] == ["Across"], profiles
        assert profiles[0].tolerance() == 10
    full = project.viewSettings().presetFullExtent()
    assert full.xMaximum() == 141 and full.crs().authid() == "EPSG:4326", full
    engine = project.labelingEngineSettings()
    if hasattr(engine, "rules"):
        assert [rule.name() for rule in engine.rules()] == ["Spread"]
        assert engine.rules()[0].distance() == 5
    assert project.timeSettings().timeStep() == 2
    assert project.timeSettings().temporalRange().begin().date().year() == 2020
    group = project.layerTreeRoot().findGroup("Group")
    assert group.isMutuallyExclusive()
    assert group.customProperty("plugin/flag") == "x"
    metadata = project.metadata()
    assert metadata.author() == "Me" and metadata.abstract() == "About"
    assert metadata.keywords() == {"places": ["city"]}
    assert metadata.contacts()[0].name == "Bob" and metadata.history() == ["v1"]


def check_layer_types(project):
    layers = {layer.name(): layer for layer in project.mapLayers().values()}
    names = sorted(layers)
    assert names == ["annotations", "group", "inner", "mesh", "tiles"] or names == [
        "group",
        "inner",
        "mesh",
        "notes",
        "tiles",
    ], names
    if "annotations" in layers:
        layers["notes"] = layers["annotations"]
    tiles = layers["tiles"]
    assert tiles.isValid()
    styles = tiles.renderer().styles()
    assert [s.styleName() for s in styles] == ["roads"]
    assert styles[0].minZoomLevel() == 5 and styles[0].layerName() == "roads"
    assert styles[0].filterExpression() == "\"class\" = 'major'"
    assert styles[0].symbol().color().name() == "#ff0000"
    label_styles = tiles.labeling().styles()
    assert [s.styleName() for s in label_styles] == ["names"]
    assert label_styles[0].labelSettings().fieldName == "name"

    mesh = layers["mesh"]
    assert mesh.isValid(), mesh.error().summary()
    settings = mesh.rendererSettings()
    assert settings.nativeMeshSettings().isEnabled()
    assert settings.nativeMeshSettings().color().name() == "#ff0000"

    if project.title() == "Layer types (edited)":
        # Edited from QGIS output, which keeps its dataset-group store.
        scalar = settings.scalarSettings(0)
        assert scalar.opacity() == 0.8 and scalar.classificationMaximum() == 4
        vector = settings.vectorSettings(0)
        arrow = vector.arrowSettings()
        assert arrow.arrowHeadWidthRatio() == 0.3, arrow.arrowHeadWidthRatio()
        assert arrow.fixedShaftLength() == 12
        if hasattr(vector, "windBarbSettings"):  # QGIS 3.38+
            assert vector.windBarbSettings().shaftLength() == 5
        items = scalar.colorRampShader().colorRampItemList()
        assert [item.label for item in items] == ["low", "high"]

    notes = layers["notes"]
    items = sorted(notes.items().values(), key=lambda item: item.type())
    assert [item.type() for item in items] == ["marker", "pointtext"]
    assert items[0].symbol().color().name() == "#0000ff"
    assert items[1].text() == "Hello" and items[1].format().size() == 14

    group = layers["group"]
    assert [layer.id() for layer in group.childLayers()] == [layers["inner"].id()]


def check_layouts(project):
    manager = project.layoutManager()
    names = sorted(layout.name() for layout in manager.printLayouts())
    assert names == ["Edited layout", "New layout"], names
    reports = [r for r in manager.layouts() if r.layoutType() == 1]  # Report
    assert [r.name() for r in reports] == ["Points report"], reports
    report = reports[0]
    assert report.headerEnabled() and report.header().pageCollection().pageCount() == 1
    group = report.childSection(0)
    assert group.field() == "name" and group.layer().name() == "points"
    assert group.body().pageCollection().pageCount() == 1
    edited = manager.layoutByName("Edited layout")
    assert edited.itemById("title").text() == "Edited title"
    map_item = edited.itemById("main map")
    extent = map_item.extent()
    assert (extent.xMinimum(), extent.yMaximum()) == (135, 42), extent.toString()
    assert [layer.name() for layer in map_item.layers()] == ["points"]
    assert map_item.grids().grid(0).intervalX() == 2
    shapes = [i for i in edited.items() if isinstance(i, QgsLayoutItemShape)]
    assert shapes[0].symbol().color().name() == "#008000"
    assert edited.atlas().filenameExpression() == "'atlas_' || @atlas_featurenumber"
    tables = [f for f in edited.multiFrames() if f.type() == 65649]
    assert tables[0].columns()[0].heading() == "Name!"
    assert edited.customProperty("plugin/x") == "2"

    created = manager.layoutByName("New layout")
    assert created.pageCollection().pageCount() == 1
    page = created.pageCollection().page(0)
    assert round(page.pageSize().width()) == 297
    heading = created.itemById("heading")
    assert heading.text() == "Hello layout"
    assert heading.textFormat().size() == 24
    overview = created.itemById("overview map")
    assert overview.extent().xMaximum() == 150
    assert overview.crs().authid() == "EPSG:4326"
    assert [layer.name() for layer in overview.layers()] == ["points"]
    assert list(overview.layerStyleOverrides()) == [
        project.mapLayersByName("points")[0].id()
    ]
    assert overview.isLabelBlockingItem(heading)
    legend = created.itemById("legend")
    assert [m.id() for m in legend.filterByMapItems()] == ["overview map"]
    scale = created.itemById("scale")
    assert scale.numericFormat().numberDecimalPlaces() == 3
    groups = [i for i in created.items() if i.type() == 65637]
    assert len(groups) == 1 and len(groups[0].items()) == 2, groups
    profile = created.itemById("profile")
    assert profile.profileCurve().asWkt() == "LineString (139 35, 141 37)"
    assert profile.tolerance() == 5
    assert [layer.name() for layer in profile.layers()] == ["points"]
    assert profile.plot().xAxis().gridIntervalMajor() == 20
    assert profile.plot().yMaximum() == 50
    tables = [f for f in created.multiFrames() if f.type() == 65652]
    assert len(tables) == 1 and tables[0].frameCount() == 1
    contents = tables[0].tableContents()
    assert [cell.content() for cell in contents[0]] == ["1", "two"], contents
    assert tables[0].columnWidths() == [20, 0]


def check_styles(project):
    layer = list(project.mapLayers().values())[0]
    manager = layer.styleManager()
    assert sorted(manager.styles()) == ["default", "navy", "red"], manager.styles()
    assert manager.currentStyle() == "red"
    assert manager.setCurrentStyle("navy")
    assert layer.renderer().symbol().color().name() == "#000080"
    # Headless QGIS 3.44+ does not instantiate legacy canvas annotations.
    annotations = project.annotationManager().annotations()
    assert len(annotations) <= 1
    if annotations:
        assert annotations[0].mapPosition().x() == 5
        assert "Note" in annotations[0].document().toPlainText()


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
    if Qgs3D:
        Qgs3D.initialize()
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
            ("project-settings.qgs", check_project_settings),
            ("project-settings-roundtrip.qgs", check_project_settings),
            ("layer-types.qgs", check_layer_types),
            ("layer-types-roundtrip.qgs", check_layer_types),
            ("layer-types-edited.qgs", check_layer_types),
            ("layouts.qgs", check_layouts),
            ("layouts-roundtrip.qgs", check_layouts),
            ("styles-edited.qgs", check_styles),
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
    print("QGIS verified 21 projects", flush=True)


if __name__ == "__main__":
    main()
