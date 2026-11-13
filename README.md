# qgserde

QGIS 3/4のプロジェクトXML（`.qgs`）を、型付きのTypeScriptモデルへデシリアライズし、編集後にXMLへ書き戻すライブラリです。

[APIドキュメント](https://kanahiro.github.io/qgserde/)

```ts
import { parseQgs, serializeQgs } from "qgserde";

const project = parseQgs(qgsXml);
project.title = "札幌の地図";
project.crs = { authId: "EPSG:4326" };

for (const layer of project.layers) {
  layer.name = `${layer.name}（編集済み）`;
  layer.opacity = 0.8;
  if (layer.type === "vector") {
    layer.labelsEnabled = true;
    // layer.fields は QgsField[]。raster 等のレイヤーには存在しません。
    for (const field of layer.fields) field.alias = field.name;
  }
}

project.layers.push({
  type: "vector",
  id: "cities_001",
  name: "都市",
  provider: "ogr",
  source: "./cities.gpkg|layername=cities",
  crs: { authId: "EPSG:4326" },
  fields: [],
});

const xml = serializeQgs(project, { version: "4.2" }); // UTF-8で保存
```

## 型付きモデル

`QgsProject`は、特定バージョンのXML構造に依存しない、QGISのデータを表す通常のオブジェクトです。XMLタグを検索したり、数値・真偽値を文字列へ変換したりする必要はありません。バージョンはモデルに持たせず、書き出すたびに指定します。

```ts
interface QgsProject {
  title: string;
  layers: QgsMapLayer[];
  metadata: QgsProjectMetadata;
  crs?: QgsCrs;
  verticalCrs?: QgsCrs;
  homePath?: string;
  extent?: QgsReferencedRectangle;
  rotation?: number;
  layerTree?: QgsLayerTreeGroup;
  layerOrder?: string[];
  // 加えて、未モデル化の設定を保持する内部用preservedXmlがあります。
}
```

| 型                                        | 編集できる内容                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `QgsProjectMetadata`                      | 識別子、言語、著者、概要、作成日時など。タイトルは`project.title`に集約                      |
| `QgsCrs`                                  | authority ID、WKT、PROJ、説明、既存のCRSメタデータ                                           |
| `QgsRectangle` / `QgsReferencedRectangle` | 数値のxmin/ymin/xmax/ymax、表示範囲のCRS                                                     |
| `QgsVectorLayer`                          | 共通レイヤー情報、ジオメトリ、読み取り専用・ラベルの有効状態、フィールド設定、レンダラー設定 |
| `QgsRasterLayer`                          | 共通レイヤー情報、レンダラーの不透明度・バンド設定                                           |
| `QgsField`                                | 名前、エディター種別、別名、デフォルト式、更新時のデフォルト適用                             |
| `QgsLayerTreeGroup` / `QgsLayerTreeLayer` | 入れ子のグループ、参照先レイヤーID、展開・チェック状態、カスタム描画順                       |

レイヤーの共通情報は`id`、`name`、`provider`、`source`、`providerEncoding`、`crs`、`extent`、`opacity`、スケール制限です。識別子・データソース・式・日付は文字列、座標・不透明度・スケールは数値、有効状態は真偽値です。

`QgsMapLayer`は`type`による判別可能なunionです。`vector`、`raster`に加え、`mesh`、`vector-tile`、`point-cloud`、`plugin`、`annotation`、`group`、`tiled-scene`を識別します。将来の種別は`QgsUnknownLayer`（`type: "unknown"`、元の種別は`xmlType`）になります。未知の種別を単なる`string`へ広げないため、ベクターとラスターの型の絞り込みが機能します。

ベクターレンダラーの`type`やフィールドのエディター種別は、プラグインで拡張される識別子なので文字列です。ベクターでは属性・symbolLevels・forceRaster・referenceScale、ラスターではopacity・alphaBand・band・redBand・greenBand・blueBandを型付きで扱います。シンボルや分類ルールの詳細、ラベル式、リレーション、レイアウト等は、現時点では個別の編集モデルを提供せず、元XMLとして保持します。

## 編集とXMLへの反映

モデルのプロパティを編集して`serializeQgs`を呼ぶと、必要なXMLの保存先を更新します。

- `project.title`は、ルートの`title`、`projectMetadata/title`、`projectname`に反映します。
- `project.crs`は、QGISの投影有効フラグも合わせて設定します。読み込み時は無効な投影のCRSを`project.crs`に公開せず、元XMLに保持します。既存の有効なCRSを削除すると投影を無効化します。
- `project.extent`と`rotation`は、出力先のバージョンに合わせて保存します。表示範囲は3.10.1以降、回転は3.28以降で`ProjectViewSettings`を使い、それ以前は`mapcanvas`を使います。入力に両方ある場合は双方を同期します。範囲のCRSは`extent.crs`で指定でき、新規の表示範囲では省略時にプロジェクトCRSを使います。
- 既存レイヤーの名前・データソース・プロバイダーは、レイヤーツリー内の対応する参照にも反映します。プロバイダーが生成したUID等は、未編集の場合は保持します。
- `layers.push(...)`で追加したレイヤーには、必要なツリー参照と既存の描画順リストへの項目を追加します。レイヤーを配列から削除すると、そのツリー参照・描画順項目も取り除きます。
- レイヤーIDを変更すると、ツリーと描画順のIDも更新します。リレーション、結合、レイアウト、プラグイン等に含まれる他のID参照は自動更新しないため、これらを持つプロジェクトではIDを維持してください。

CRSのauthorityだけを指定する場合も、呼び出し側でQGIS内部のCRSデータベースを参照する必要はありません。XMLの互換処理をコーデック内で行います。CRS自体を変更するときは`project.crs = { authId: "EPSG:3857" }`のようにオブジェクト全体を置き換えると、古いWKT等を引き継ぎません。

オブジェクトは`JSON.stringify` / `JSON.parse`で保存・復元できます。書き出しはコピーで行い、呼び出し側のモデルを変更しません。

`preservedXml`は未知の要素・属性・順序・コメント・CDATA等を保持する内部スナップショットです。型付きプロパティが編集内容の唯一の正本であり、スナップショットを直接編集するAPIは提供しません。`QgsProject`では必須であり、この情報がないモデルの書き出しは`INVALID_EDIT`になります。

## 新規作成とバージョン指定

```ts
import { createProject, serializeQgs } from "qgserde";

const project = createProject(templateXml, "新しい地図");
project.metadata.author = "作成者";
const qgis3Xml = serializeQgs(project, { version: "3.44" });
const qgis4Xml = serializeQgs(project, { version: "4.2" });
```

`templateXml`は呼び出し側で読み込んだQGS文字列です。テンプレートのレイヤー・メタデータ・ツリー・未知の設定をすべて引き継ぎます。タイトルを省略するとテンプレートのタイトルを維持し、空文字列を指定すると空にします。最小構成の例は[`examples/template.qgs`](examples/template.qgs)です。QGISで作った独自のテンプレートも利用できます。

`serializeQgs`では出力先のQGIS 3/4バージョンを必ず指定します。`3.40`は`3.40.0`へ正規化し、`3.40.0-Bratislava`や`4.2.0-Belém do Pará`のようなリリース名も扱います。未指定・不正なバージョン・3/4以外のメジャーバージョンは`INVALID_VERSION`です。

パース時に型付きプロパティへ読み取り、書き出し時に対象形式へ変換します。同じモデルを、入力バージョンや直前の出力先に関係なく再利用できます。JSONで保存・復元したモデルも同様です。

```ts
const project = parseQgs(qgis3Xml);
project.title = "編集後の地図";
const qgis4Xml = serializeQgs(project, { version: "4.2" });
const qgis3XmlAgain = serializeQgs(project, { version: "3.44" });
```

`migrate`・`versionPolicy`は廃止しました。形式の違いはコーデック内で扱い、呼び出し側にバージョン間の移行処理を要求しません。

変換対象は型付きで扱うプロパティです。未モデル化のXML・プラグイン設定・レンダラーの詳細は元の内容を保持し、バージョン間の変換は行いません。また、出力先QGISに存在しない機能やレイヤー種別を代替する処理はありません。出力バージョンの指定だけで、プロジェクト全体の互換性を保証するものではありません。

## 制約

- XML構造・値の保持を目的とし、バイト単位の再現は保証しません。引用符・空要素・エンティティ表記、XML規格に従う改行正規化は変わり得ます。既存の空白は保持し、自動整形しません。
- `.qgz`のZIP、`.qgd`、添付ファイル、地理データ自体は扱いません。データソースの存在確認・保存先に応じたパスの変換も行いません。
- 入出力はUnicode文字列で、出力にXML宣言がある場合はUTF-8に正規化します。ファイルI/Oは呼び出し側の責任です。
- XML 1.0のみ対応し、外部DTDを取得しません。内部DTD・カスタムエンティティ・深さ512超・循環したツリーは拒否します。
- 型付きの既知フィールドとXMLの整形式を扱うコーデックであり、QGISの全機能を網羅するスキーマ検証器ではありません。
- ESM形式です。本体はNode.js APIやブラウザーDOMに依存せず、`structuredClone`のある環境で利用できます。ブラウザーではバンドラーを使用してください。

APIは破壊的変更になります。`createProject(title)`は`createProject(templateXml, title?)`へ置き換え、`project.version`の代わりに`serializeQgs(project, { version })`で出力先を指定してください。前のXMLツリー形式のタイトル操作関数は`title`への代入へ、レイヤー操作関数は`layers`配列への操作へ置き換えてください。任意のXML要素を返す公開APIは廃止しました。

## 開発・検証

Node.js 24以上とpnpmを使用します。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm typecheck
pnpm test
pnpm build
pnpm docs:build
```

TypeScript 6系を使用します。`pnpm docs:build`で公開APIのHTMLを`docs/api/`へ生成します。
説明はソースのコメント、入門ページは`docs/index.md`で管理します。公開APIの説明漏れ・
壊れた参照はドキュメントビルドを失敗させます。生成物はコミットしません。

`Documentation`ワークフローはPRで生成を検証し、`main`へのpush時にGitHub Pagesへ公開します。
Pagesの公開元はGitHub Actions（`build_type: workflow`）に設定します。

`typecheck`には、不正なプロパティ・値の型や、unionの絞り込みを検証するコンパイル時テストも含みます。QGIS 3/4の実XMLを使って、未変更時の保持、型付きプロパティの編集、JSON保存後の再出力を検証します。GitHub ActionsでもNode.js 24/26でチェックします。

CIではQGIS公式Dockerイメージの3.44・4.0・4.2でも読み込みテストを実行します。それぞれのバージョン向けXMLをテスト時にqgserdeから生成し、新規作成・旧形式からの変換・実XMLの編集・27タイルレイヤーを含むプロジェクト・その再出力の5ファイルを検証します。タイトル・CRS・表示範囲・回転に加え、全レイヤーとプロバイダーの有効性、ベクタータイルのシンボルとズーム範囲、ツリー参照の解決、OSMのみの初期表示を確認します。Dockerコンテナは通信を無効にして実行し、外部タイルサービスの応答には依存しません。

CIと同じ検証をローカルで実行する例:

```sh
node test/qgis/fixtures.ts /tmp/qgserde-projects 3.44
docker run --rm --network none -e QT_QPA_PLATFORM=offscreen \
  -v "$PWD:/workspace:ro" -v /tmp/qgserde-projects:/projects:ro \
  -w /workspace --entrypoint python3 qgis/qgis:3.44 \
  test/qgis/verify-projects.py /projects 3.44
```

4.0は`qgis/qgis:4.0-trixie`、4.2は`qgis/qgis:4.2-trixie`を使用し、生成時と検証時のバージョン指定も合わせます。

PyQGISが利用できる環境では、実際の読み込みも検証できます。

```sh
QGIS_PYTHON=/path/to/python-with-qgis QGIS_VERSION=4.2 pnpm test
```

必要に応じて`PYTHONPATH`も設定してください。`QGIS_PYTHON`が未指定の場合は結合テストのみスキップします。`QGIS_VERSION`の既定値は4.2です。CIとローカルで同じ生成処理とPythonの検証処理を使用し、実行中のQGISが指定バージョンと異なる場合も失敗します。ここでは読み込みを検証し、タイルの取得や描画は行いません。

## 参照

- [QGIS公式 QGS/QGZファイル形式](https://documentation.qgis.org/3.44/en/docs/user_manual/appendices/qgis_file_formats.html)
- [QGIS公式プロジェクト読み書き実装](https://github.com/qgis/QGIS/blob/release-4_2/src/core/project/qgsproject.cpp)
- [QGIS公式表示設定の読み書き実装](https://github.com/qgis/QGIS/blob/release-3_44/src/core/project/qgsprojectviewsettings.cpp)
- [QGIS公式CRSの読み書き実装](https://github.com/qgis/QGIS/blob/release-3_44/src/core/proj/qgscoordinatereferencesystem.cpp)
- テストデータの出典・ライセンス: [test/fixtures/README.md](test/fixtures/README.md)
