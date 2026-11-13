import { QgsError } from "./errors.ts";
import type { QgisVersion } from "./types.ts";

/**
 * QGISのバージョン表記を数値部分とリリース名へ分解します。
 *
 * @param value - `3.40`、`3.40.0-Bratislava`等。前後の空白や先頭の`v`は許可しません。
 * @returns パッチ省略時は0、リリース名がある場合はsuffixを含む値。
 * @remarks この関数は表記を解析します。書き出し可能なメジャーバージョンの制限は
 * {@link serializeQgs} で検査します。
 * @throws {@link QgsError} 表記が不正、または数値が安全な整数の範囲外の場合は`INVALID_VERSION`。
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
