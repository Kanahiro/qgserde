# Contributing

Use Node.js 24 or later and the pnpm version pinned in `package.json`.
The project uses TypeScript 6.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm typecheck
pnpm test
pnpm build
pnpm docs:build
```

Run `pnpm format` to apply formatting fixes. Tests cover typed edits, unknown
data and order preservation, JSON storage, invalid input, and real QGIS project
fixtures. Type checking also verifies public API usage and union narrowing.
CI runs these checks on Node.js 24 and 26.

Place unit tests beside the module they exercise as `module.test.ts`.
Unit tests exercise individual modules directly. Keep integration tests that
exercise parsing, editing, and serialization together through the public API
in `test/`, alongside shared fixtures and QGIS verification scripts.
`pnpm test` runs both suites; use `pnpm test:unit` or `pnpm test:integration`
to run one suite. `src/types.test.ts` contains compile-time assertions checked
by `pnpm typecheck`. Unit tests are excluded from build output and package files.

## Documentation

Public API descriptions live in source comments. `docs/index.md` is the guide
shown on the documentation homepage. Write documentation in English and
describe the current API.

`pnpm docs:build` generates the TypeDoc site in `docs/api/`. Missing API
comments and broken references fail the build. Generated HTML is not committed.
The `Documentation` workflow checks pull requests and publishes `main` to
[GitHub Pages](https://kanahiro.github.io/qgserde/). The repository's Pages source
must be set to GitHub Actions (`build_type: workflow`).

## QGIS integration tests

CI opens seven projects in each of the official QGIS 3.44, 4.0, and 4.2 Docker
images: a new project, a conversion from an older format, an edited fixture,
a tile project with nested groups and repeated references, its round trip,
and a WMS project with a repaired short layer ID and its round trip.
Checks cover title, CRS, extent, rotation, layer and provider validity,
vector-tile symbols and zoom ranges, tree references, and the initial visible
layer.

Run the same checks locally:

```sh
node test/qgis/fixtures.ts /tmp/qgserde-projects 3.44
docker run --rm --network none -e QT_QPA_PLATFORM=offscreen \
  -v "$PWD:/workspace:ro" -v /tmp/qgserde-projects:/projects:ro \
  -w /workspace --entrypoint python3 qgis/qgis:3.44 \
  test/qgis/verify-projects.py /projects 3.44
```

For QGIS 4.0, use `qgis/qgis:4.0-trixie`; for 4.2, use
`qgis/qgis:4.2-trixie`. Set the version in both the generation and verification
commands to match the image. Containers run without network access. Tests read
projects without fetching tiles or rendering maps. WMS capabilities come from
a local XML fixture.

With a local PyQGIS installation, the test runner can use its Python executable:

```sh
QGIS_PYTHON=/path/to/python-with-qgis QGIS_VERSION=4.2 pnpm test
```

Set `PYTHONPATH` if needed. Without `QGIS_PYTHON`, only the PyQGIS integration
test is skipped. `QGIS_VERSION` defaults to `4.2`. The local test and CI share
the fixture generator and Python verifier; a QGIS version mismatch fails the
test.

## Format references

- [QGIS project file format](https://documentation.qgis.org/3.44/en/docs/user_manual/appendices/qgis_file_formats.html)
- [Project reader and writer](https://github.com/qgis/QGIS/blob/release-4_2/src/core/project/qgsproject.cpp)
- [View settings](https://github.com/qgis/QGIS/blob/release-3_44/src/core/project/qgsprojectviewsettings.cpp)
- [CRS reader and writer](https://github.com/qgis/QGIS/blob/release-3_44/src/core/proj/qgscoordinatereferencesystem.cpp)
- [Fixture sources and licenses](test/fixtures/README.md)
