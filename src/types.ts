import type { QgsExtensions } from "./extensions.ts";

/** Values stay strings: coercing IDs, expressions, or coordinates loses information. */
export interface XmlElement {
  type: "element";
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
}

export interface XmlText {
  type: "text";
  value: string;
}

export interface XmlCdata {
  type: "cdata";
  value: string;
}

export interface XmlComment {
  type: "comment";
  value: string;
}

export interface XmlProcessingInstruction {
  type: "instruction";
  target: string;
  body: string;
}

export interface XmlDoctype {
  type: "doctype";
  value: string;
}

export interface XmlDeclaration {
  version: "1.0";
  encoding?: string;
  standalone?: "yes" | "no";
}

export type XmlNode =
  | XmlElement
  | XmlText
  | XmlCdata
  | XmlComment
  | XmlProcessingInstruction;

export type XmlMisc = XmlText | XmlComment | XmlProcessingInstruction;

/** Low-level XML representation, independent of the public QGIS model. */
export interface XmlDocument {
  declaration?: XmlDeclaration;
  before: (XmlMisc | XmlDoctype)[];
  root: XmlElement;
  after: XmlMisc[];
}

/**
 * バージョンに依存しない、編集可能なプロジェクトモデル。
 *
 * 型付きプロパティが編集内容の正本です。JSON保存時は未モデル化の設定を保持する
 * 拡張データと順序情報も残してください。出力先は {@link serializeQgs} で指定します。
 */
export interface QgsProject {
  /** プロジェクトのタイトル。編集するとQGISの複数のタイトル保存先を同期します。 */
  title: string;
  /** レイヤー一覧。追加・削除は書き出し時にツリー参照と描画順へ反映します。 */
  layers: QgsMapLayer[];
  /** タイトル以外のプロジェクトメタデータ。 */
  metadata: QgsProjectMetadata;
  /** 水平CRS。削除するとプロジェクトの投影を無効にします。 */
  crs?: QgsCrs;
  /** 垂直CRS。出力先QGISが対応している場合に利用できます。 */
  verticalCrs?: QgsCrs;
  /** QGISのプロジェクトホームパス。ファイルのパス変換は行いません。 */
  homePath?: string;
  /** 初期表示範囲。範囲自体のCRSを指定できます。 */
  extent?: QgsReferencedRectangle;
  /** 初期表示の時計回りの回転角（度）。有限の数値を指定します。 */
  rotation?: number;
  /** レイヤーの表示階層。テンプレートに含まれる場合はその階層を引き継ぎます。 */
  layerTree?: QgsLayerTreeGroup;
  /** レイヤーIDによる描画順。配列から削除されたレイヤーは出力時に除外します。 */
  layerOrder?: string[];
  /** @internal Unmodeled values and ordering slots; never an original XML document. */
  readonly extensions?: QgsExtensions;
}

/**
 * CRSの識別子と定義。authority IDだけでも指定できます。
 *
 * 定義を変更するときは `{ authId: "EPSG:3857" }` のようにオブジェクト全体を
 * 置き換えると、読み取り元のWKTやPROJ定義を引き継ぎません。
 */
export interface QgsCrs {
  /** @internal Provenance needed to distinguish authority lookup from an unchanged legacy CRS. */
  readonly extensions?: QgsExtensions;
  /** authority ID。例: `EPSG:4326`。 */
  authId?: string;
  /** Well-Known TextによるCRS定義。 */
  wkt?: string;
  /** PROJ文字列によるCRS定義。 */
  proj4?: string;
  /** CRSの説明・表示名。 */
  description?: string;
  /** 読み取り元のQGIS内部CRS ID。authority IDのみの指定では省略できます。 */
  srsId?: number;
  /** 読み取り元の空間参照ID。 */
  srid?: number;
  /** 地理座標系かどうかを示すQGISのフラグ。 */
  geographic?: boolean;
  /** QGISの投影法略称。 */
  projectionAcronym?: string;
  /** QGISの楕円体略称。 */
  ellipsoidAcronym?: string;
  /** 読み取り元のCRS定義形式を示すQGIS属性。 */
  nativeFormat?: string;
}

/** CRSの座標単位で表す矩形。各座標には有限の数値を指定します。 */
export interface QgsRectangle {
  /** X座標の下限。 */
  xmin: number;
  /** Y座標の下限。 */
  ymin: number;
  /** X座標の上限。 */
  xmax: number;
  /** Y座標の上限。 */
  ymax: number;
}

/** CRSを持つ表示範囲。座標の再投影は行いません。 */
export interface QgsReferencedRectangle extends QgsRectangle {
  /** この範囲のCRS。新規の表示範囲で省略するとプロジェクトCRSを使います。 */
  crs?: QgsCrs;
}

/** プロジェクトの記述情報。タイトルは {@link QgsProject.title} に集約します。 */
export interface QgsProjectMetadata {
  /** プロジェクトのメタデータ識別子。 */
  identifier?: string;
  /** 親となるリソースの識別子。 */
  parentIdentifier?: string;
  /** メタデータの言語コード。 */
  language?: string;
  /** リソースの種別。 */
  type?: string;
  /** プロジェクトの概要。 */
  abstract?: string;
  /** 作成者名。 */
  author?: string;
  /** 作成日時の文字列表現。Dateへの変換やタイムゾーン補正は行いません。 */
  creationDateTime?: string;
}

/** ツリーのチェック状態。`partial`は一部の子がチェックされている状態です。 */
export type QgsCheckState = "checked" | "unchecked" | "partial";

/** レイヤーと子グループをまとめる表示階層。ルートもこの型です。 */
export interface QgsLayerTreeGroup {
  /** グループノードを識別する値。 */
  type: "group";
  /** グループの表示名。 */
  name: string;
  /** ツリーUIで展開するかどうか。 */
  expanded: boolean;
  /** グループのチェック状態。 */
  checked: QgsCheckState;
  /** 表示順に並んだ子ノード。同じレイヤーへの複数の参照も可能です。 */
  children: QgsLayerTreeNode[];
  /** ツリーの並びから独立したカスタム描画順。 */
  customOrder?: {
    /** カスタム描画順を使用するかどうか。 */
    enabled: boolean;
    /** カスタム描画順に並べたレイヤーID。 */
    layerIds: string[];
  };
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** レイヤー一覧の1項目をIDで参照する表示ノード。 */
export interface QgsLayerTreeLayer {
  /** レイヤー参照ノードを識別する値。 */
  type: "layer";
  /** 参照先の {@link QgsMapLayerBase.id}。 */
  layerId: string;
  /** ツリーUIで展開するかどうか。 */
  expanded: boolean;
  /** レイヤー参照のチェック状態。親グループの状態も実際の表示に影響します。 */
  checked: QgsCheckState;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** `type`でグループとレイヤー参照を判別するツリーノード。 */
export type QgsLayerTreeNode = QgsLayerTreeGroup | QgsLayerTreeLayer;

/** 全レイヤー種別に共通する設定。データソース自体の編集は行いません。 */
export interface QgsMapLayerBase {
  /** プロジェクト内で一意かつ空でないID。外部の設定にも参照され得るため維持を推奨します。 */
  id: string;
  /** レイヤー名。編集すると対応するツリー参照の名前も更新します。 */
  name: string;
  /** プロバイダー固有の接続文字列・URI。存在確認や保存先に応じたパス変換は行いません。 */
  source: string;
  /** QGISプロバイダーの識別子。例: `ogr`、`gdal`、`memory`、`wms`。 */
  provider: string;
  /** プロバイダーの文字エンコーディング設定。 */
  providerEncoding?: string;
  /** レイヤーCRS。地理データの座標変換は行いません。 */
  crs?: QgsCrs;
  /** レイヤーCRSの座標単位による範囲。 */
  extent?: QgsRectangle;
  /** レイヤーの不透明度。QGISでは0が透明、1が不透明です。 */
  opacity?: number;
  /** QGISのminScale設定（縮尺分母）。適用はscaleBasedVisibilityで制御します。 */
  minScale?: number;
  /** QGISのmaxScale設定（縮尺分母）。適用はscaleBasedVisibilityで制御します。 */
  maxScale?: number;
  /** 縮尺に応じた表示制限を有効にするかどうか。 */
  scaleBasedVisibility?: boolean;
  /** @internal Unmodeled values and ordering slots. */
  readonly extensions?: QgsExtensions;
}

/** ベクターレイヤーの設定。属性の値やフィーチャーは含みません。 */
export interface QgsVectorLayer extends QgsMapLayerBase {
  /** ベクターレイヤーを識別する値。 */
  type: "vector";
  /** QGISのジオメトリ種別表記。例: `Point`。 */
  geometry?: string;
  /** QGISのWKBジオメトリ型表記。 */
  wkbType?: string;
  /** QGIS上で読み取り専用にするかどうか。 */
  readOnly?: boolean;
  /** ラベルを有効にするかどうか。ラベル式等の詳細は拡張データに保持します。 */
  labelsEnabled?: boolean;
  /** フィールドの表示・入力設定。データソースのスキーマは変更しません。 */
  fields: QgsField[];
  /** ベクターレンダラーの共通設定。 */
  renderer?: QgsVectorRenderer;
}

/** ラスターレイヤーとバンドの表示設定。 */
export interface QgsRasterLayer extends QgsMapLayerBase {
  /** ラスターレイヤーを識別する値。 */
  type: "raster";
  /** ラスターレンダラーの共通設定。 */
  renderer?: QgsRasterRenderer;
}

/** 共通プロパティを編集できるその他の既知レイヤー。固有設定は拡張データに保持します。 */
export interface QgsOtherLayer extends QgsMapLayerBase {
  /** レイヤー種別。入力の`pointcloud`も`point-cloud`へ正規化します。 */
  type:
    | "mesh"
    | "vector-tile"
    | "point-cloud"
    | "plugin"
    | "annotation"
    | "group"
    | "tiled-scene";
}

/** 未知の種別を保持するレイヤー。既知の種別の型の絞り込みを妨げません。 */
export interface QgsUnknownLayer extends QgsMapLayerBase {
  /** 未知のレイヤー種別を識別する値。 */
  type: "unknown";
  /** 入力XMLの種別名。書き出し時に復元します。 */
  xmlType: string;
}

/**
 * `type`で判別するレイヤーのunion。
 *
 * @example
 * ```ts
 * for (const layer of project.layers) {
 *   if (layer.type === "vector") layer.labelsEnabled = true;
 * }
 * ```
 */
export type QgsMapLayer =
  | QgsVectorLayer
  | QgsRasterLayer
  | QgsOtherLayer
  | QgsUnknownLayer;

/** ベクターフィールドの表示・入力設定。フィールドの値は扱いません。 */
export interface QgsField {
  /** データソース上のフィールド名。 */
  name: string;
  /** QGISの入力ウィジェット種別。例: `TextEdit`、`Range`。 */
  editorWidgetType?: string;
  /** QGIS上の表示用別名。 */
  alias?: string;
  /** デフォルト値のQGIS式。文字列として保持し、評価は行いません。 */
  defaultExpression?: string;
  /** 更新時にもデフォルト式を適用するかどうか。 */
  applyDefaultOnUpdate?: boolean;
  /** @internal */
  readonly extensions?: QgsExtensions;
}

/** ベクターレンダラーの共通設定。シンボルや分類ルールの詳細は拡張データに保持します。 */
export interface QgsVectorRenderer {
  /** QGISのレンダラー識別子。例: `singleSymbol`、`categorizedSymbol`。 */
  type: string;
  /** 分類等で使用する属性名または式の文字列。解釈はレンダラーに依存します。 */
  attribute?: string;
  /** シンボルレベルを使用するかどうか。 */
  symbolLevels?: boolean;
  /** 描画時のラスター化を強制するかどうか。 */
  forceRaster?: boolean;
  /** レンダラーの基準縮尺（縮尺分母）。無効値の扱いはQGISに依存します。 */
  referenceScale?: number;
}

/** ラスターレンダラーの共通設定。色変換等の詳細は拡張データに保持します。 */
export interface QgsRasterRenderer {
  /** QGISのレンダラー識別子。例: `multibandcolor`。 */
  type: string;
  /** レンダラーの不透明度。QGISでは0が透明、1が不透明です。 */
  opacity?: number;
  /** アルファチャンネルに使用するバンド番号。未使用等の特別値はQGISの表記を保持します。 */
  alphaBand?: number;
  /** 単一バンドのレンダラーで使用するバンド番号。通常は1始まりです。 */
  band?: number;
  /** 赤チャンネルに使用するバンド番号。通常は1始まりです。 */
  redBand?: number;
  /** 緑チャンネルに使用するバンド番号。通常は1始まりです。 */
  greenBand?: number;
  /** 青チャンネルに使用するバンド番号。通常は1始まりです。 */
  blueBand?: number;
}

/** {@link parseQgisVersion} が返す、数値部分と任意のリリース名。 */
export interface QgisVersion {
  /** メジャーバージョン。 */
  major: number;
  /** マイナーバージョン。 */
  minor: number;
  /** パッチバージョン。入力で省略されていた場合は0です。 */
  patch: number;
  /** ハイフンより後のリリース名。例: `Bratislava`。 */
  suffix?: string;
}

/** {@link createProject} の初期設定。すべて省略可能です。 */
export interface CreateProjectOptions {
  /** テンプレートQGS文字列。省略時は空のプロジェクトを作ります。 */
  templateXml?: string;
  /** タイトル。省略時はテンプレートの値を維持し、テンプレートもなければ空文字列です。 */
  title?: string;
}

/** {@link serializeQgs} の出力先設定。呼び出しごとに指定します。 */
export interface SerializeOptions {
  /** 出力先のQGIS 3/4バージョン。`3.40`は`3.40.0`へ正規化します。 */
  version: string;
}
