# Contributing

Use the Active LTS Node.js version in `.node-version` and the pnpm version
pinned in `package.json`. The supported LTS lines are Node.js 24.22.1+ and
26.12.1+. The project uses TypeScript 6.

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

Dependency updates must pass a strict seven-day quarantine, configured in
`pnpm-workspace.yaml`. Do not lower the release age or disable strict mode to
resolve an installation failure.

The QGIS verifier is Python. Install uv 0.13.5 or later, then run:

```sh
uv sync --locked
uv run --locked ruff check .
uv run --locked ruff format --check .
```

Python tooling uses `.python-version`, `pyproject.toml`, and the committed
`uv.lock`, with a seven-day dependency quarantine. CI checks Python lint and
formatting separately. Run `uv run --locked ruff format .` to format Python.
PyQGIS itself comes from the QGIS installation; it is not a PyPI dependency.
The verifier runs with that installation's Python to match the PyQGIS binary
ABI, even when its version differs from the development Python. Do not replace
the Python interpreter inside the official QGIS images.

GitHub Actions use release tags with commits pinned in
`.github/workflows/actions.lock`. After adding or updating an action, run
`gh actions-lock` and commit the updated lockfile with the workflow.

Place unit tests beside the module they exercise as `module.test.ts`.
Unit tests exercise individual modules directly. Keep integration tests that
exercise parsing, editing, and serialization together through the public API
in `test/`, alongside shared fixtures and QGIS verification scripts.
`pnpm test` runs both suites; use `pnpm test:unit` or `pnpm test:integration`
to run one suite. `src/types.test.ts` contains compile-time assertions checked
by `pnpm typecheck`. Unit tests are excluded from build output and package files.

## Codec contract

Every supported setting must be decoded into the intermediate model and encoded
from that model on every write. Never bypass validation or reconstruction because
a value is unchanged or came from XML. Apply the same output rules to parsed,
JSON-restored, and newly created models. Missing values may be completed only
when the codec knows their meaning; ambiguous or invalid data must fail explicitly.

Extensions hold unknown values and placement information. They must not provide
a fallback copy of known settings. If a supported setting has distinct meanings
(such as a disabled CRS or an independent legacy view), represent those meanings
in the model. Origin information is only for identity matching and reference
synchronization, never an exemption from validation or encoding.

Test semantic reconstruction, normalization, unknown-data preservation, and
repeated-write stability. Exact reproduction of input XML is not the contract.

## Documentation

Public API descriptions live in source comments. `docs/index.md` is the guide
shown on the documentation homepage. Write documentation in English and
describe the current API.

`pnpm docs:build` generates the TypeDoc site in `docs/api/`. Missing API
comments and broken references fail the build. Generated HTML is not committed.
The `Documentation` workflow checks pull requests and publishes `main` to
[GitHub Pages](https://kanahiro.github.io/qgserde/). The repository's Pages source
must be set to GitHub Actions (`build_type: workflow`).

## Publishing

The `Publish` workflow publishes to npm when a GitHub Release is published.
It checks formatting, types, and tests; the `prepack` hook builds the package.
Draft releases and tag pushes alone do not publish.

Before the first automated release, configure a GitHub Actions
[trusted publisher](https://docs.npmjs.com/trusted-publishers/) in the npm
package settings:

- Organization or user: `Kanahiro`
- Repository: `qgserde`
- Workflow filename: `publish.yaml`
- Environment name: leave empty
- Allow direct publishing with `npm publish`

No npm token secret is required. If the package does not exist on npm yet,
publish the initial version manually from a clean release checkout using
`pnpm install --frozen-lockfile`, the checks above, and
`npm publish --access public` after authenticating with `npm login`.
Then configure the trusted publisher for subsequent versions.

To release, update `package.json`'s version in a PR and merge it. Create a
GitHub Release from that commit with the tag `v<version>` (for example,
`v0.1.1`); the workflow rejects mismatched tags. Stable releases publish under
the npm `latest` tag. For prereleases, use a version such as `0.2.0-beta.1`
and mark the GitHub Release as a prerelease; these publish under `next`.
Each version can only be published once.

## QGIS integration tests

CI opens seven projects in each of the official QGIS 3.44, 4.0, and 4.2 Docker
images: a new project, a conversion from an older format, an edited fixture,
a tile project with nested groups and repeated references, its round trip,
and a WMS project with a repaired short layer ID and its round trip.
The conversion and gallery/WMS round trips also exercise incomplete input
containing authority IDs without CRS lookup markers.
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
