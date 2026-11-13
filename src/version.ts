import { QgsError } from "./errors.ts";
import type { QgisVersion } from "./types.ts";

/**
 * Parse a QGIS version into numeric parts and an optional release name.
 *
 * @param value - A version such as `3.40` or `3.40.0-Bratislava`. Leading or trailing
 * whitespace and a leading `v` are not accepted.
 * @returns Version parts, with a patch of 0 when omitted and a suffix when supplied.
 * @remarks This function parses syntax. {@link serializeQgs} enforces the supported
 * output major versions.
 * @throws {@link QgsError} `INVALID_VERSION` for invalid syntax or numbers outside
 * the safe integer range.
 * @example
 * ```ts
 * parseQgisVersion("3.40"); // { major: 3, minor: 40, patch: 0 }
 * ```
 */
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
