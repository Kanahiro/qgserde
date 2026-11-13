import { QgsError } from "./errors.ts";
import type { QgisVersion } from "./types.ts";

/** Accepts QGIS release names such as 3.40.0-Bratislava as well as 3.40. */
export function parseQgisVersion(value: string): QgisVersion {
  if (typeof value !== "string")
    throw new QgsError("INVALID_VERSION", "A QGIS version string is required");
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:-([^\p{Cc}<>"'&]+))?$/u.exec(
      value,
    );
  if (!match || value.trim() !== value) {
    throw new QgsError("INVALID_VERSION", `Invalid QGIS version: ${value}`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3] ?? 0);
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    throw new QgsError("INVALID_VERSION", `Invalid QGIS version: ${value}`);
  }
  return { major, minor, patch, ...(match[4] ? { suffix: match[4] } : {}) };
}

export function normalizeVersion(value: string): string {
  const { major, minor, patch, suffix } = parseQgisVersion(value);
  if (major !== 3 && major !== 4)
    throw new QgsError(
      "INVALID_VERSION",
      "Writing projects is supported for QGIS 3 and 4",
    );
  return `${major}.${minor}.${patch}${suffix ? `-${suffix}` : ""}`;
}
