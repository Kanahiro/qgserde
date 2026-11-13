# 公開タイルの入出力サンプル

`tile-gallery.qgs` はqgserdeの型付きモデルから生成するQGIS 4.2形式のサンプルです。
`tile-gallery-3.44.qgs`、`tile-gallery-4.0.qgs`、`tile-gallery-4.2.qgs` も同時に生成します。

- ラスター22レイヤー：OpenStreetMap、OpenTopoMap、CyclOSM、国土地理院、Natural Earth。
- ベクタータイル5レイヤー：OpenFreeMapのLiberty、Bright、Positron、Dark、Fiord。
- 初期表示はOpenStreetMap Standardのみ。初期範囲は東京周辺。
- 提供元・用途・年代別の多階層グループと、同一レイヤーの別グループへの参照を含みます。

生成・検証にネットワークやQGISのインストールは不要です。

```sh
node examples/create-tile-gallery.ts
pnpm test
```

テストではレイヤー種別・参照整合性・OSMのみの初期表示と、パース→出力→再パース後のモデル一致を確認します。ベクタータイルのスタイルURLは接続情報として記録しています。QGISによるタイル取得・スタイル変換・描画は検証していません。

ベクタータイルには、QGIS 3.44でも読み込めるよう基本のポリゴン・線・点のレンダラーを出力します。各名称の配色はスタイルURLを読み込むまでは適用されません。GitHub ActionsではQGIS 3.44・4.0・4.2の公式Dockerイメージで、全レイヤーの有効性、シンボル、ツリー参照、OSMのみの初期表示と再出力後の読み込みを検証します。

接続URL、ズーム範囲、出典は `create-tile-gallery.ts` の `tileSources` にまとめています。出典一覧はプロジェクトの概要にも記録しています。公開サービスの利用条件や提供範囲は各提供元を確認してください。

- [OpenStreetMap](https://www.openstreetmap.org/copyright)
- [OpenTopoMap](https://opentopomap.org/about)
- [CyclOSM](https://www.cyclosm.org/)
- [国土地理院](https://maps.gsi.go.jp/development/ichiran.html)
- [OpenFreeMap](https://openfreemap.org/)
