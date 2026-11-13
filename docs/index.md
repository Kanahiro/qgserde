# qgserde

QGIS 3/4のプロジェクトXML（`.qgs`）をTypeScriptのオブジェクトとして読み取り、編集して書き出すライブラリです。公開APIの関数・型・プロパティをこのサイトで参照できます。

## 読み取りと編集

`parseQgs`で読み取ったモデルは、特定のQGISバージョンに依存しません。`serializeQgs`の呼び出しごとに出力先バージョンを指定します。

```ts
import { parseQgs, serializeQgs } from "qgserde";

const project = parseQgs(qgsXml);
project.title = "札幌の地図";
project.crs = { authId: "EPSG:4326" };
for (const layer of project.layers) {
  layer.opacity = 0.8;
  if (layer.type === "vector") {
    for (const field of layer.fields) field.alias = field.name;
  }
}
const qgis3Xml = serializeQgs(project, { version: "3.44" });
const qgis4Xml = serializeQgs(project, { version: "4.2" });
```

## 新規作成

`createProject(templateXml, title?)`はテンプレートとなるQGS文字列を必須で受け取ります。テンプレートに含まれるレイヤー・メタデータ・レイヤーツリー・未知の設定を引き継ぎます。タイトルを省略すると元のタイトルを維持し、空文字列を渡すと空にします。レイヤーを配列に追加すると、書き出し時にツリー参照も追加されます。

```ts
import { createProject, serializeQgs } from "qgserde";

// templateXmlはQGISで用意したテンプレートファイル等から読み込んだ文字列
const project = createProject(templateXml, "都市の地図");
project.crs = { authId: "EPSG:4326" };
project.layers.push({
  type: "vector",
  id: "cities_001",
  name: "都市",
  provider: "ogr",
  source: "./cities.gpkg|layername=cities",
  crs: { authId: "EPSG:4326" },
  fields: [],
});
const xml = serializeQgs(project, { version: "4.2" });
```

## モデルの扱い

- プロジェクト全体は`QgsProject`、レイヤーは`QgsMapLayer`です。レイヤーの`type`でベクター・ラスター等の型を絞り込めます。
- CRSは`QgsCrs`、範囲は`QgsRectangle`と`QgsReferencedRectangle`で指定します。CRSを変えるときはオブジェクト全体を置き換えると、古いWKT等を引き継ぎません。
- レイヤーの表示階層は`QgsLayerTreeGroup`、描画順は`QgsProject.layerOrder`で編集します。同じレイヤーをツリー内で複数回参照できます。
- `QgsField`で別名・入力ウィジェット・デフォルト式を編集できます。フィールドの定義をデータソース自体へ書き込む機能はありません。
- モデルは`JSON.stringify` / `JSON.parse`で保存・復元できます。書き出しはモデルを変更しません。

## 保持する情報と互換性

未モデル化の設定・コメント・CDATA・要素順は内部スナップショットで保持します。スナップショットを直接編集せず、モデルのプロパティを編集してください。JSON保存時も内部情報を残すことで未モデル化の設定を維持できます。この情報は必須です。失われたモデルは`INVALID_EDIT`で書き出しを拒否します。

表示範囲・回転などの既知の形式差はコーデックが処理します。プラグイン設定・シンボル・レイアウト等の未モデル化のXMLはバージョン間変換を行いません。出力先QGISに存在しない機能を代替することもありません。

レイヤーIDの変更はレイヤーツリーと描画順に反映しますが、リレーション・結合・レイアウト・プラグイン内のID参照は更新しません。これらを持つプロジェクトのIDは維持してください。

## エラー

`parseQgs`・`serializeQgs`・`parseQgisVersion`の失敗は`QgsError`で通知します。メッセージの文字列ではなく`code`で分類できます。

```ts
import { parseQgs, QgsError } from "qgserde";

try {
  const project = parseQgs(qgsXml);
} catch (error) {
  if (error instanceof QgsError) console.error(error.code, error.message);
  else throw error;
}
```

| コード            | 意味                                                                        |
| ----------------- | --------------------------------------------------------------------------- |
| `INVALID_XML`     | XMLが不正、または内部DTD・非対応のXMLバージョン・過剰な深さ等を含む         |
| `INVALID_PROJECT` | ルート・必須属性・モデル化する数値や真偽値等が不正                          |
| `INVALID_VERSION` | バージョン表記が不正、出力先未指定、または出力先がQGIS 3/4以外              |
| `INVALID_EDIT`    | 保持元XMLの欠落・重複ID・循環したツリー・有限でない数値等、書き出せない編集 |

## 入出力の範囲

入力と出力はUnicode文字列で、ファイルI/Oは呼び出し側で行います。XML宣言の文字コードは出力時にUTF-8に揃えます。バイト単位の再現・`.qgz`のZIP・添付ファイル・地理データ・データソースの存在確認・保存先に応じたパス変換は扱いません。

ESM形式で、`structuredClone`を利用できる環境が必要です。ブラウザーではバンドラーを利用してください。
