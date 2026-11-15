import { readFileSync } from "node:fs";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

if (process.env.RELEASE_TAG !== `v${version}`) {
  throw new Error(
    `Release tag must be v${version}; got ${process.env.RELEASE_TAG}`,
  );
}
if (process.env.NPM_DIST_TAG === "latest" && version.includes("-")) {
  throw new Error("Prerelease versions must be marked as a GitHub prerelease");
}
