# Fixtures

- `qgis3.qgs`: QGIS公式リポジトリの[`layer_rendering_order_qgis3_project.qgs`](https://github.com/qgis/QGIS/blob/release-3_44/tests/testdata/layer_rendering_order_qgis3_project.qgs)を変更せず収録。元の保存バージョンは`3.1.0-Master`です。QGIS contributors、GPL-2.0-or-later。ライセンス本文は`QGIS-LICENSE.txt`（同リポジトリの`COPYING`）です。外部データの読み込みは行わず、XMLの保持を検証します。
- `qgis4.qgs`: QGIS `4.2.0-Belém do Pará`のPyQGISで作成。タイトル`QGIS 4 fixture`、EPSG:4326のmemoryポイントレイヤー`札幌`を含みます。保存者・保存日時の属性を除去し、外部のスタイルDBへの参照を除去しています。

QGIS 4の生成手順（PyQGIS環境で実行）:

```python
from qgis.core import QgsApplication, QgsProject, QgsVectorLayer

app = QgsApplication([], False)
app.initQgis()
project = QgsProject()
project.setTitle("QGIS 4 fixture")
layer = QgsVectorLayer("Point?crs=EPSG:4326&field=name:string", "札幌", "memory")
project.addMapLayer(layer)
project.write("qgis4.qgs")
```
