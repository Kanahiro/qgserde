import type { QgsProject } from "../../src/index.ts";
import { createProject } from "../../src/index.ts";

/** Project-level settings: properties, relations, themes, bookmarks, and more. */
export function createProjectSettingsProject(): QgsProject {
  const project = createProject({ title: "Project settings" });
  const crs = { authId: "EPSG:4326" };
  project.crs = crs;
  const points = "points_layer_0001";
  const lines = "lines_layer_00001";
  project.layers.push(
    {
      type: "vector",
      id: points,
      name: "points",
      provider: "memory",
      source: "Point?crs=EPSG:4326&field=id:integer",
      crs,
      fields: [],
    },
    {
      type: "vector",
      id: lines,
      name: "lines",
      provider: "memory",
      source: "LineString?crs=EPSG:4326&field=id:integer&field=pid:integer",
      crs,
      fields: [],
    },
  );
  project.layerTree!.children.push({
    type: "group",
    name: "Group",
    expanded: true,
    checked: "checked",
    children: [
      {
        type: "layer",
        layerId: lines,
        name: "lines",
        expanded: true,
        checked: "checked",
        patch: { type: 1, wkt: "LineString (0 0, 1 1)", preserveAspect: true },
      },
    ],
    attributes: { "mutually-exclusive": "1" },
    customProperties: { "plugin/flag": "x" },
  });
  project.properties = {
    Variables: {
      variableNames: ["city", "zoom"],
      variableValues: ["Sapporo", "12"],
    },
    WMSServiceTitle: "My service",
    WMSCrsList: ["EPSG:3857", "EPSG:4326"],
    Measure: { Ellipsoid: "EPSG:7030" },
    Measurement: { DistanceUnits: "km", AreaUnits: "km2" },
  };
  project.transactionMode = "AutomaticGroups";
  project.projectFlags = "EvaluateDefaultValuesOnProviderSide";
  project.relations = [
    {
      attributes: {
        id: "lines_points",
        name: "lines→points",
        referencingLayer: lines,
        referencedLayer: points,
        strength: "Composition",
      },
      fieldRefs: [{ referencingField: "pid", referencedField: "id" }],
    },
  ];
  project.mapThemes = [
    {
      name: "Only points",
      layers: [{ id: points, visible: true, style: "default", expanded: true }],
    },
  ];
  project.bookmarks = [
    {
      attributes: {
        id: "{11111111-1111-1111-1111-111111111111}",
        name: "Home",
        group: "Places",
        extent: "POLYGON((1 2, 3 2, 3 4, 1 4, 1 2))",
        rotation: 10,
      },
      crs,
    },
  ];
  project.transformContext = [
    {
      attributes: {
        coordinateOp: "+proj=pipeline +step +proj=noop",
        allowFallback: true,
      },
      source: crs,
      destination: { authId: "EPSG:3857" },
    },
  ];
  project.snapping = {
    attributes: {
      enabled: 1,
      mode: 2,
      type: 1,
      tolerance: 20,
      unit: 1,
    },
  };
  project.useProjectScales = true;
  project.scales = ["5000", "1000"];
  project.mapViews3D = [
    {
      attributes: { name: "3D Map 1", isOpen: false },
      settings: {
        origin: { x: 140, y: 36, z: 0 },
        camera: { "field-of-view": 50, "projection-type": 1 },
        color: { background: "10,20,30,255", selection: "255,255,0,255" },
        crs: { authId: "EPSG:4326" },
        terrain: { "terrain-rendering-enabled": 1, "map-theme": "" },
        layers: ["points_layer_0001"],
        terrainGenerator: { type: "flat" },
        lights: [
          {
            kind: "directional",
            attributes: {
              x: 0,
              y: -1,
              z: 0,
              color: "255,255,255,255",
              intensity: 0.8,
            },
          },
        ],
        eyeDomeLighting: { enabled: 1, "eye-dome-lighting-strength": 1000 },
      },
      cameraPose: { x: 140, y: 0, z: -36, dist: 5000, pitch: 30, heading: 10 },
    },
  ];
  project.sensors = [
    {
      attributes: {
        id: "{cccccccc-0000-0000-0000-000000000001}",
        type: "tcp_socket",
        name: "GPS feed",
        hostName: "localhost",
        port: 2000,
      },
    },
  ];
  project.elevationProfiles = [
    {
      attributes: { name: "Across", tolerance: 10, distanceUnit: "Meters" },
      crs: { authId: "EPSG:4326" },
      curve: "LineString (139 35, 141 37)",
    },
  ];
  project.loadProjectExtent = true;
  project.presetFullExtent = { xmin: 139, ymin: 35, xmax: 141, ymax: 37 };
  project.presetFullExtentCrs = { authId: "EPSG:4326" };
  project.labelEngineRules = [
    {
      id: "minimumDistanceLabelToLabel",
      name: "Spread",
      distance: 5,
      distanceUnit: "MM",
      labeledLayer: "points_layer_0001",
      targetLayer: "points_layer_0001",
    },
  ];
  project.timeSettings = {
    attributes: { timeStep: 2, timeStepUnit: "h", frameRate: 5 },
    range: { start: "2020-01-01T00:00:00Z", end: "2021-01-01T00:00:00Z" },
  };
  project.metadata = {
    abstract: "About",
    author: "Me",
    keywords: [{ vocabulary: "places", keywords: ["city"] }],
    contacts: [{ fields: { name: "Bob" } }],
    history: ["v1"],
  };
  return project;
}
