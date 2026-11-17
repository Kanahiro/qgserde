import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { writeQgisFixtures } from "./qgis/fixtures.ts";

// CI invokes the same fixture generator and Python verifier in QGIS containers.
const qgisPython = process.env.QGIS_PYTHON;
test("QGIS opens generated, edited and round-tripped projects including vector tiles and WMS", {
  skip: !qgisPython,
}, async () => {
  assert.ok(qgisPython);
  const directory = mkdtempSync(join(tmpdir(), "qgserde-"));
  const version = process.env.QGIS_VERSION ?? "4.2";
  try {
    await writeQgisFixtures(directory, version);
    const output = execFileSync(
      qgisPython,
      [
        fileURLToPath(new URL("./qgis/verify-projects.py", import.meta.url)),
        directory,
        version,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, QT_QPA_PLATFORM: "offscreen" },
        timeout: 60_000,
      },
    );
    assert.match(output, /QGIS verified 21 projects/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
