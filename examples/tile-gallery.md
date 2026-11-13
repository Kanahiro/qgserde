# Tile gallery

The gallery shows how to build a QGIS project with raster tiles, vector tiles,
nested groups, and multiple tree references to the same layer.

`tile-gallery.qgs` targets QGIS 4.2. The generator also writes
`tile-gallery-3.44.qgs`, `tile-gallery-4.0.qgs`, and `tile-gallery-4.2.qgs`.

- 22 raster layers from OpenStreetMap, OpenTopoMap, CyclOSM, the Geospatial
  Information Authority of Japan (GSI), and Natural Earth.
- Five OpenFreeMap vector-tile layers: Liberty, Bright, Positron, Dark, and Fiord.
- OpenStreetMap Standard is the only layer visible on load. The initial extent
  covers Tokyo.
- Nested groups organize layers by provider, use, and date. Comparison groups
  reference some of the same layers again.

## Generate the projects

```sh
node examples/create-tile-gallery.ts
pnpm test
```

Generation and unit tests need no network access or QGIS installation. Tests
check layer types, reference integrity, initial visibility, and model equality
after parsing, writing, and parsing again.

Vector tiles include basic polygon, line, and point renderers readable by QGIS
3.44. Style URLs are recorded in the connection settings; the named color
schemes apply only after a style is loaded. Tests do not fetch tiles, convert
remote styles, or render maps. CI also opens the projects in QGIS 3.44, 4.0, and
4.2 to check layer validity, symbols, references, and visibility.

## Tile sources

Connection URLs, zoom ranges, and credits are listed in `tileSources` in
[create-tile-gallery.ts](create-tile-gallery.ts). Credits are also written into
the project's abstract. Check each provider's coverage and usage terms before
using its service.

- [OpenStreetMap](https://www.openstreetmap.org/copyright)
- [OpenTopoMap](https://opentopomap.org/about)
- [CyclOSM](https://www.cyclosm.org/)
- [GSI](https://maps.gsi.go.jp/development/ichiran.html)
- [OpenFreeMap](https://openfreemap.org/)
