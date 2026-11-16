import { QgsError } from "./errors.ts";
import type { QgsProject } from "./types.ts";

// Kept equal to package.json by json.test.ts.
export const VERSION = "0.1.1";

function compatible(version: string): boolean {
  const [major, minor] = version.split(/[.-]/u);
  const [currentMajor, currentMinor] = VERSION.split(/[.-]/u);
  // Semver: 0.x changes are breaking per minor; 1.0+ per major.
  return currentMajor === "0"
    ? major === "0" && minor === currentMinor
    : major === currentMajor;
}

/**
 * Write a model as JSON tagged with the qgserde version that wrote it.
 *
 * @param project - A parsed, restored, or newly created model.
 * @returns JSON string of the form `{"qgserde":"<version>","project":{...}}`.
 * @example
 * ```ts
 * const saved = serializeJson(parseQgs(qgsXml));
 * const xml = serializeQgs(parseJson(saved), { version: "4.2" });
 * ```
 */
export function serializeJson(project: QgsProject): string {
  return JSON.stringify({ qgserde: VERSION, project });
}

/**
 * Read JSON written by {@link serializeJson}.
 *
 * Only the envelope and version are checked here; the model itself is validated
 * by {@link serializeQgs}, as for any other model.
 *
 * @param json - Output of {@link serializeJson}.
 * @returns The stored model.
 * @throws {@link QgsError} `INVALID_JSON` for malformed JSON or a missing envelope, or
 * `INVALID_VERSION` when written by an incompatible qgserde version (a different
 * major version, or a different minor version before 1.0).
 */
export function parseJson(json: string): QgsProject {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    throw new QgsError("INVALID_JSON", "Malformed JSON", { cause: error });
  }
  const { qgserde, project } = (data ?? {}) as Record<string, unknown>;
  if (
    typeof qgserde !== "string" ||
    project === null ||
    typeof project !== "object" ||
    Array.isArray(project)
  )
    throw new QgsError(
      "INVALID_JSON",
      "Expected a qgserde version and a project object",
    );
  if (!compatible(qgserde))
    throw new QgsError(
      "INVALID_VERSION",
      `JSON written by qgserde ${qgserde} is incompatible with ${VERSION}`,
    );
  return project as QgsProject;
}
