import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createProject,
  type QgsLayerTreeGroup,
  type QgsLayerTreeLayer,
  type QgsProject,
  serializeQgs,
} from "../src/index.ts";

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
const gsiCredit = `地理院タイル / 国土地理院 — ${gsiWebsite}`;

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
    groups: ["02 日本 / 国土地理院", ...groups],
  };
}

export const tileSources: TileSource[] = [
  {
    id: "osm_standard",
    name: "OpenStreetMap Standard — 初期表示",
    type: "raster",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 19,
    attribution: osmCredit,
    website: "https://operations.osmfoundation.org/policies/tiles/",
    groups: ["01 世界 / OSM系ラスター", "基本地図", "OpenStreetMap"],
  },
  {
    id: "opentopomap",
    name: "OpenTopoMap — 地形・等高線",
    type: "raster",
    url: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 17,
    attribution: `${osmCredit} / SRTM / © OpenTopoMap (CC-BY-SA)`,
    website: "https://opentopomap.org/",
    groups: ["01 世界 / OSM系ラスター", "地形・アウトドア", "地形図"],
  },
  {
    id: "cyclosm_base",
    name: "CyclOSM — 自転車地図",
    type: "raster",
    url: "https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 20,
    attribution: `${osmCredit} / © CyclOSM / OpenStreetMap France`,
    website: "https://www.cyclosm.org/",
    groups: [
      "01 世界 / OSM系ラスター",
      "地形・アウトドア",
      "自転車",
      "ベースマップ",
    ],
  },
  {
    id: "cyclosm_lite",
    name: "CyclOSM Lite — 自転車オーバーレイ",
    type: "raster",
    url: "https://a.tile-cyclosm.openstreetmap.fr/cyclosm-lite/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 20,
    attribution: `${osmCredit} / © CyclOSM / OpenStreetMap France`,
    website: "https://www.cyclosm.org/",
    groups: [
      "01 世界 / OSM系ラスター",
      "地形・アウトドア",
      "自転車",
      "重ね合わせ",
    ],
  },
  gsi("std", "地理院タイル 標準地図", 2, 18, ["ベースマップ", "地図"]),
  gsi("pale", "地理院タイル 淡色地図", 2, 18, ["ベースマップ", "地図"]),
  gsi("blank", "地理院タイル 白地図", 5, 14, ["ベースマップ", "地図"]),
  gsi("english", "GSI English — 英語地図", 2, 11, ["ベースマップ", "地図"]),
  gsi(
    "seamlessphoto",
    "全国最新写真（シームレス）",
    2,
    18,
    ["写真", "現在"],
    "jpg",
    "一部画像：林野庁・地方公共団体・NASA/USGS・Axelspace",
  ),
  gsi(
    "gazo4",
    "空中写真 1987–1990年",
    10,
    17,
    ["写真", "年代別", "昭和後期"],
    "jpg",
  ),
  gsi(
    "gazo3",
    "空中写真 1984–1986年",
    10,
    17,
    ["写真", "年代別", "昭和後期"],
    "jpg",
  ),
  gsi(
    "gazo2",
    "空中写真 1979–1983年",
    10,
    17,
    ["写真", "年代別", "昭和中期"],
    "jpg",
  ),
  gsi(
    "gazo1",
    "空中写真 1974–1978年",
    10,
    17,
    ["写真", "年代別", "昭和中期"],
    "jpg",
  ),
  gsi(
    "relief",
    "色別標高図",
    5,
    15,
    ["地形", "標高・陰影"],
    "png",
    "海域部は海上保安庁海洋情報部の資料を使用して作成",
  ),
  gsi("hillshademap", "陰影起伏図", 2, 16, ["地形", "標高・陰影"]),
  gsi("earthhillshade", "陰影起伏図（全球版・z0–8）", 0, 8, [
    "地形",
    "標高・陰影",
  ]),
  gsi("slopemap", "傾斜量図", 3, 15, ["地形", "傾斜・雪崩関連"]),
  gsi("slopezone1map", "全国傾斜量区分図（雪崩関連）", 3, 15, [
    "地形",
    "傾斜・雪崩関連",
  ]),
  gsi("sekishoku", "赤色立体地図", 2, 14, ["地形", "立体表現"]),
  gsi("anaglyphmap_color", "アナグリフ（カラー）", 2, 16, [
    "地形",
    "立体表現",
    "アナグリフ",
  ]),
  gsi("anaglyphmap_gray", "アナグリフ（グレー）", 2, 16, [
    "地形",
    "立体表現",
    "アナグリフ",
  ]),
  {
    id: "natural_earth",
    name: "Natural Earth — 世界の地形（z0–6）",
    type: "raster",
    url: "https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 6,
    attribution: "Natural Earth (public domain) / OpenFreeMap",
    website: "https://www.naturalearthdata.com/about/terms-of-use/",
    groups: ["03 世界 / 小縮尺", "Natural Earth"],
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
        "04 ベクタータイル",
        "OpenFreeMap",
        "OpenMapTiles",
        ["dark", "fiord"].includes(style) ? "暗色" : "明色・標準",
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
  const root = group("公開タイル比較");
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
    group("05 比較実験 / 同じレイヤーへの別参照", [
      group("地形と写真", [
        group("標高の見え方", [
          reference("gsi_relief_layer"),
          reference("gsi_hillshademap_layer"),
        ]),
        group("写真", [reference("gsi_seamlessphoto_layer")]),
      ]),
      group("明色と暗色", [
        reference("openfreemap_positron"),
        reference("openfreemap_dark"),
      ]),
      group("自転車を重ねる", [reference("cyclosm_lite")]),
    ]),
  );
  root.customOrder = {
    enabled: false,
    layerIds: tileSources.map((source) => source.id),
  };
  return root;
}

export function createTileGallery(): QgsProject {
  const project = createProject("公開タイル比較 — Raster × Vector");
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
  project.metadata.author = "qgserde example";
  project.metadata.abstract = [
    "qgserdeの入出力確認用。初期表示はOSM Standardのみ。",
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

export async function writeTileGallery(
  destination: string,
  version = "4.2",
): Promise<void> {
  const project = createTileGallery();
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, serializeQgs(project, { version }), "utf8");
  console.log(
    `Wrote ${destination} (${project.layers.length} tile layers; only osm_standard visible)`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await writeTileGallery(
    fileURLToPath(new URL("./tile-gallery.qgs", import.meta.url)),
  );
  for (const version of ["3.44", "4.0", "4.2"]) {
    await writeTileGallery(
      fileURLToPath(new URL(`./tile-gallery-${version}.qgs`, import.meta.url)),
      version,
    );
  }
}
