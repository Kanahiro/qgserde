# qgserde

QGISのプロジェクトXML（`.qgs`）を、編集可能なTypeScriptオブジェクトに変換し、XMLへ書き戻すライブラリです。QGIS 3系・4系のプロジェクトを扱います。

```ts
import {
  addLayer,
  createLayer,
  parseQgs,
  serializeQgs,
  setProjectTitle,
  updateLayer,
} from "qgserde";

const project = parseQgs(qgsXml);
setProjectTitle(project, "札幌の地図");

addLayer(
  project,
  createLayer({
    id: "cities_001",
    name: "都市",
    type: "vector",
    provider: "ogr",
    source: "./cities.gpkg|layername=cities",
    crs: "EPSG:4326",
  }),
);

updateLayer(project, "cities_001", { name: "都市一覧" });

// 入力と同じQGISバージョンで出力。ファイルにはUTF-8で保存します。
const xml = serializeQgs(project);
```

通常の用語では、XML → Objectがデシリアライズ、Object → XMLがシリアライズなので、書き出しを`serializeQgs`としています。

## オブジェクト表現

`QgsProject`はメソッドを持たない通常のオブジェクトです。`JSON.stringify` / `JSON.parse`で保存・復元でき、そのまま編集できます。

```ts
interface QgsProject {
  declaration?: XmlDeclaration;
  before: (XmlMisc | XmlDoctype)[];
  root: XmlElement;
  after: XmlMisc[];
}

interface XmlElement {
  type: "element";
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
}
```

属性・テキストはすべて文字列です。`"0001"`、`"false"`、座標、式を数値や真偽値へ暗黙変換しません。要素の順序・繰り返し・混在テキスト・名前空間・コメント・CDATA・処理命令・外部DOCTYPE・未知のQGIS/プラグイン設定を保持します。バージョンの唯一の保存先は`project.root.attributes.version`です。

```ts
import {
  createElement,
  findChild,
  findChildren,
  getText,
  setText,
} from "qgserde";

const properties = findChild(project.root, "properties"); // 直下だけを検索
const children = findChildren(project.root); // 直下の全要素

project.root.children.push(
  createElement("custom-setting", { enabled: "1" }, [
    { type: "text", value: "A & B" },
  ]),
);
```

`setText`は対象要素の内容全体を置き換えます。`getText`は子孫のテキスト・CDATAを連結します。XMLの属性・ノード名は書き出し時に検証し、特殊文字はエスケープします。

タイトルには`setProjectTitle`を使ってください。ルートの`title`、`projectMetadata/title`、`projectname`を同時に更新します。`getProjectTitle`はQGISと同様にメタデータのタイトルを優先します。

`getLayers`は編集可能な`maplayer`要素の配列を返します。`createLayer`はベクター/ラスターの最小定義を作り、`addLayer`は定義をコピーしてプロジェクトへ追加し、レイヤーツリーと既存の描画順リストも更新します。`updateLayer`は名前・データソース・プロバイダーを、入れ子になったレイヤーツリー内の同じIDの参照にも反映します。スタイル等の詳細は返されたXML要素で編集できます。

## バージョンを指定する

新規プロジェクトは指定したバージョンで作成できます。

```ts
import { createProject, serializeQgs } from "qgserde";

const project3 = createProject("3.40", "QGIS 3の地図");
const project4 = createProject("4.2", "QGIS 4の地図");
const xml = serializeQgs(project4, { version: "4.2.0" });
```

`3.40`は`3.40.0`に正規化します。`3.40.0-Bratislava`や`4.2.0-Belém do Pará`のようなリリース名も扱えます。出力バージョンを省略した場合は、入力の値を維持します。

**既存プロジェクトのバージョン間の自動形式変換は実装していません。** QGISの機能・プロバイダー・プラグインごとの互換性は、ルートの`version`属性の変更だけでは保証できません。既定の`strict`では、数値バージョンを変更する際に`MIGRATION_REQUIRED`を送出します。パッチバージョンの変更も対象です。リリース名のみの変更には移行処理は不要です。

形式変換が必要な場合は、対象とする機能に応じた移行処理を渡します。

```ts
const xml = serializeQgs(project, {
  version: "4.2",
  migrate(copy, { from, to }) {
    // 対象プロジェクトの機能を検査し、必要なXMLの変更をcopyに適用します。
    // 非対応機能を検出した場合はthrowしてください。
    migrateSupportedProject(copy, from, to); // アプリケーション側の移行処理
  },
});
```

`migrate`は数値バージョンが変わる場合だけ呼び出されます。元オブジェクトを変更せず、コピーに対して実行します。コールバックの例外はそのまま伝播し、結果のXMLも再検証します。

内容を維持してバージョン属性だけを変更したい場合は、明示的に`preserve`を指定できます。**これは対象QGISでの動作を保証しません。**

```ts
const xml = serializeQgs(project, {
  version: "4.2",
  versionPolicy: "preserve",
});
```

## 保持範囲と制約

- XML構造・値の保持を目的とし、バイト単位の再現は保証しません。引用符、空要素の表記、エンティティ表記、XML規格に従う改行の正規化は変わり得ます。既存の要素内空白を保持し、自動整形は行いません。空のテキストノードはXMLへの書き出し後に消え、隣接テキストノードは結合される場合があります。
- 入出力はUnicode文字列です。出力にXML宣言がある場合は`encoding="UTF-8"`へ正規化します。文字コードのデコード・エンコードとファイル入出力は呼び出し側で行います。
- `.qgz`のZIP、`.qgd`、添付ファイル、地理データは読み書きしません。QGISのデータソースパスは入力値を保持し、保存先に応じた書き換えは行いません。
- XML 1.0のみ対応します。外部DTDを取得せず、内部DTD・カスタムエンティティは拒否します。深さ512を超えるXMLや循環した編集オブジェクトもエラーになります。
- XMLの整形式と`qgis`ルート・バージョンを検証します。QGIS固有の全機能、データソースの存在、レイヤーIDへの全参照の整合性まで検証するスキーマバリデーターではありません。IDを変更する場合や関係・レイアウト等を編集する場合は、関連する参照も更新してください。
- ESM形式です。ライブラリ本体はNode.js APIやブラウザーDOMに依存せず、`structuredClone`のある環境で利用できます。ブラウザーではバンドラーを使用してください。開発・テストはNode.js 24以上で実行します。

## エラー

XML/プロジェクト/バージョン/編集の検証エラーは`QgsError`で返します。`code`は`INVALID_XML`、`INVALID_PROJECT`、`INVALID_VERSION`、`MIGRATION_REQUIRED`、`INVALID_EDIT`のいずれかです。

## 開発・検証

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

GitHub Actionsでも同じチェックをNode.js 24/26で実行します。QGIS 3の実プロジェクトとQGIS 4.2が生成したプロジェクトを使って、XML → Object → XML → Objectの保持をテストします。

PyQGISが利用できる環境では実際の読み込みテストも実行できます。

```sh
QGIS_PYTHON=/path/to/python-with-qgis pnpm test
```

必要に応じて`PYTHONPATH`等も設定してください。`QGIS_PYTHON`が未指定の場合、この結合テストだけをスキップします。QGIS 4.2で、3.40/4.2形式の新規プロジェクトと、編集後の4.2プロジェクトのタイトル・レイヤー名・CRS・レイヤーツリーを検証しています。QGIS 3本体での実行は別途必要です。

## 参照

- [QGIS公式 QGS/QGZファイル形式](https://documentation.qgis.org/3.44/en/docs/user_manual/appendices/qgis_file_formats.html)
- [QGIS 3の公式プロジェクト変換実装](https://github.com/qgis/QGIS/blob/release-3_44/src/core/project/qgsprojectfiletransform.cpp)
- [QGIS 4のプロジェクト読み書き実装](https://github.com/qgis/QGIS/blob/release-4_2/src/core/project/qgsproject.cpp)
- テスト用のQGIS公式データの出典・ライセンスは[test/fixtures/README.md](test/fixtures/README.md)を参照してください。
