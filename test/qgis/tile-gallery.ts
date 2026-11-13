import {
  createProject,
  type QgsLayerTreeGroup,
  type QgsLayerTreeLayer,
  type QgsProject,
} from "../../src/index.ts";

interface TileSource {
  id: string;
  name: string;
  type: "raster" | "vector-tile";
  url: string;
  minZoom: number;
  maxZoom: number;
  attribution: string;
  website: string;
  groups: string[];
  styleUrl?: string;
}

const osmCredit =
  "© OpenStreetMap contributors — https://www.openstreetmap.org/copyright";
const gsiWebsite = "https://maps.gsi.go.jp/development/ichiran.html";
const gsiCredit = `GSI Tiles / Geospatial Information Authority of Japan — ${gsiWebsite}`;

function gsi(
  id: string,
  name: string,
  minZoom: number,
  maxZoom: number,
  groups: string[],
  extension = "png",
  extraCredit = "",
): TileSource {
  return {
    // QGIS replaces IDs of 10 characters or fewer when reading project XML.
    id: `gsi_${id}_layer`,
    name,
    type: "raster",
    url: `https://cyberjapandata.gsi.go.jp/xyz/${id}/{z}/{x}/{y}.${extension}`,
    minZoom,
    maxZoom,
    attribution: gsiCredit + (extraCredit ? ` / ${extraCredit}` : ""),
    website: gsiWebsite,
    groups: ["02 Japan / GSI", ...groups],
  };
}

export const tileSources: TileSource[] = [
  {
    id: "osm_standard",
    name: "OpenStreetMap Standard — initially visible",
    type: "raster",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 19,
    attribution: osmCredit,
    website: "https://operations.osmfoundation.org/policies/tiles/",
    groups: ["01 World / OSM raster tiles", "Base maps", "OpenStreetMap"],
  },
  {
    id: "opentopomap",
    name: "OpenTopoMap — terrain and contours",
    type: "raster",
    url: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 17,
    attribution: `${osmCredit} / SRTM / © OpenTopoMap (CC-BY-SA)`,
    website: "https://opentopomap.org/",
    groups: [
      "01 World / OSM raster tiles",
      "Terrain and outdoors",
      "Topographic maps",
    ],
  },
  {
    id: "cyclosm_base",
    name: "CyclOSM — cycling map",
    type: "raster",
    url: "https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 20,
    attribution: `${osmCredit} / © CyclOSM / OpenStreetMap France`,
    website: "https://www.cyclosm.org/",
    groups: [
      "01 World / OSM raster tiles",
      "Terrain and outdoors",
      "Cycling",
      "Base maps",
    ],
  },
  {
    id: "cyclosm_lite",
    name: "CyclOSM Lite — cycling overlay",
    type: "raster",
    url: "https://a.tile-cyclosm.openstreetmap.fr/cyclosm-lite/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 20,
    attribution: `${osmCredit} / © CyclOSM / OpenStreetMap France`,
    website: "https://www.cyclosm.org/",
    groups: [
      "01 World / OSM raster tiles",
      "Terrain and outdoors",
      "Cycling",
      "Overlays",
    ],
  },
  gsi("std", "GSI Standard", 2, 18, ["Base maps", "Maps"]),
  gsi("pale", "GSI Pale", 2, 18, ["Base maps", "Maps"]),
  gsi("blank", "GSI Blank", 5, 14, ["Base maps", "Maps"]),
  gsi("english", "GSI English", 2, 11, ["Base maps", "Maps"]),
  gsi(
    "seamlessphoto",
    "GSI Seamless Photo — latest imagery",
    2,
    18,
    ["Imagery", "Current"],
    "jpg",
    "Some imagery: Forestry Agency, local governments, NASA/USGS, Axelspace",
  ),
  gsi(
    "gazo4",
    "Aerial imagery 1987–1990",
    10,
    17,
    ["Imagery", "Historical", "Late Showa period"],
    "jpg",
  ),
  gsi(
    "gazo3",
    "Aerial imagery 1984–1986",
    10,
    17,
    ["Imagery", "Historical", "Late Showa period"],
    "jpg",
  ),
  gsi(
    "gazo2",
    "Aerial imagery 1979–1983",
    10,
    17,
    ["Imagery", "Historical", "Mid-Showa period"],
    "jpg",
  ),
  gsi(
    "gazo1",
    "Aerial imagery 1974–1978",
    10,
    17,
    ["Imagery", "Historical", "Mid-Showa period"],
    "jpg",
  ),
  gsi(
    "relief",
    "Elevation tint map",
    5,
    15,
    ["Terrain", "Elevation and hillshade"],
    "png",
    "Marine areas use data from the Japan Coast Guard Hydrographic and Oceanographic Department",
  ),
  gsi("hillshademap", "Hillshade", 2, 16, [
    "Terrain",
    "Elevation and hillshade",
  ]),
  gsi("earthhillshade", "Global hillshade (z0–8)", 0, 8, [
    "Terrain",
    "Elevation and hillshade",
  ]),
  gsi("slopemap", "Slope map", 3, 15, [
    "Terrain",
    "Slope and avalanche assessment",
  ]),
  gsi("slopezone1map", "Slope classification — avalanche assessment", 3, 15, [
    "Terrain",
    "Slope and avalanche assessment",
  ]),
  gsi("sekishoku", "Red Relief Image Map", 2, 14, ["Terrain", "3D relief"]),
  gsi("anaglyphmap_color", "Anaglyph (color)", 2, 16, [
    "Terrain",
    "3D relief",
    "Anaglyph",
  ]),
  gsi("anaglyphmap_gray", "Anaglyph (grayscale)", 2, 16, [
    "Terrain",
    "3D relief",
    "Anaglyph",
  ]),
  {
    id: "natural_earth",
    name: "Natural Earth — global relief (z0–6)",
    type: "raster",
    url: "https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 6,
    attribution: "Natural Earth (public domain) / OpenFreeMap",
    website: "https://www.naturalearthdata.com/about/terms-of-use/",
    groups: ["03 World / small scale", "Natural Earth"],
  },
  ...["liberty", "bright", "positron", "dark", "fiord"].map(
    (style): TileSource => ({
      id: `openfreemap_${style}`,
      name: `OpenFreeMap ${style[0]?.toUpperCase()}${style.slice(1)}`,
      type: "vector-tile",
      url: "https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf",
      styleUrl: `https://tiles.openfreemap.org/styles/${style}`,
      minZoom: 0,
      maxZoom: 14,
      attribution: `${osmCredit} / © OpenMapTiles / OpenFreeMap`,
      website: "https://openfreemap.org/quick_start/",
      groups: [
        "04 Vector tiles",
        "OpenFreeMap",
        "OpenMapTiles",
        ["dark", "fiord"].includes(style) ? "Dark" : "Light and standard",
      ],
    }),
  ),
];

function group(
  name: string,
  children: QgsLayerTreeGroup["children"] = [],
): QgsLayerTreeGroup {
  return {
    type: "group",
    name,
    children,
    checked: "unchecked",
    expanded: false,
  };
}

function reference(layerId: string, checked = false): QgsLayerTreeLayer {
  return {
    type: "layer",
    layerId,
    checked: checked ? "checked" : "unchecked",
    expanded: false,
  };
}

export function createTileTree(): QgsLayerTreeGroup {
  const root = group("Tile gallery");
  root.checked = "checked";
  root.expanded = true;
  for (const source of tileSources) {
    let parent = root;
    const isOsm = source.id === "osm_standard";
    for (const name of source.groups) {
      let nested = parent.children.find(
        (node): node is QgsLayerTreeGroup =>
          node.type === "group" && node.name === name,
      );
      if (!nested) {
        nested = group(name);
        parent.children.push(nested);
      }
      if (isOsm) {
        nested.checked = "checked";
        nested.expanded = true;
      }
      parent = nested;
    }
    parent.children.push(reference(source.id, isOsm));
  }
  root.children.push(
    group("05 Comparisons / repeated references", [
      group("Terrain and imagery", [
        group("Elevation views", [
          reference("gsi_relief_layer"),
          reference("gsi_hillshademap_layer"),
        ]),
        group("Imagery", [reference("gsi_seamlessphoto_layer")]),
      ]),
      group("Light and dark", [
        reference("openfreemap_positron"),
        reference("openfreemap_dark"),
      ]),
      group("Cycling overlay", [reference("cyclosm_lite")]),
    ]),
  );
  root.customOrder = {
    enabled: false,
    layerIds: tileSources.map((source) => source.id),
  };
  return root;
}

export function createTileGallery(templateXml: string): QgsProject {
  const project = createProject({
    templateXml,
    title: "Tile gallery — raster and vector",
  });
  project.layers = tileSources.map((tile) => {
    const parameters = new URLSearchParams({
      type: "xyz",
      url: tile.url,
      zmin: String(tile.minZoom),
      zmax: String(tile.maxZoom),
    });
    if (tile.styleUrl) parameters.set("styleUrl", tile.styleUrl);
    return {
      id: tile.id,
      name: tile.name,
      type: tile.type,
      provider: tile.type === "raster" ? "wms" : "xyzvectortiles",
      // Qt 5 keeps escaped ':' and '/' in QgsDataSourceUri.param(). Keep URL
      // delimiters and XYZ placeholders literal so Qt 5 and Qt 6 agree.
      source: parameters
        .toString()
        .replace(/%(?:3A|2F|7B|7D)/gi, decodeURIComponent),
      crs: { authId: "EPSG:3857" },
    };
  });
  project.metadata.author = "qgserde test fixture";
  project.metadata.abstract = [
    "qgserde tile gallery. Only OpenStreetMap Standard is visible on load.",
    ...new Set(tileSources.map((tile) => tile.attribution)),
  ].join("\n");
  project.crs = { authId: "EPSG:3857" };
  const mercatorX = (longitude: number): number =>
    (longitude * 20037508.342789244) / 180;
  const mercatorY = (latitude: number): number =>
    6378137 * Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
  project.extent = {
    xmin: mercatorX(139.55),
    ymin: mercatorY(35.53),
    xmax: mercatorX(139.95),
    ymax: mercatorY(35.82),
    crs: { authId: "EPSG:3857" },
  };
  project.rotation = 0;
  project.layerTree = createTileTree();
  project.layerOrder = tileSources.map((tile) => tile.id);
  return project;
}
