/**
 * Error categories available through {@link QgsError.code}.
 *
 * - `INVALID_XML`: Malformed or unsupported XML, internal DTD subsets, or excessive depth.
 * - `INVALID_PROJECT`: Invalid root, required attributes, or modeled values.
 * - `INVALID_JSON`: Malformed JSON or a missing qgserde JSON envelope.
 * - `INVALID_VERSION`: Invalid version syntax, a missing target, an unsupported target major version,
 *   or JSON written by an incompatible qgserde version.
 * - `INVALID_EDIT`: Duplicate IDs, cycles, edits that would lose data, or other invalid model data.
 * - `INVALID_ARCHIVE`: A malformed, encrypted, or unsupported `.qgz` archive, or invalid archive files.
 */
export type QgsErrorCode =
  | "INVALID_XML"
  | "INVALID_PROJECT"
  | "INVALID_JSON"
  | "INVALID_VERSION"
  | "INVALID_EDIT"
  | "INVALID_ARCHIVE";

/** Codec error. Use {@link code} to classify the failure. */
export class QgsError extends Error {
  /** Error name, always `QgsError`. */
  override readonly name = "QgsError";
  /** Machine-readable error category. */
  readonly code: QgsErrorCode;

  /**
   * Create an error with a category and message.
   * @param code - Error category.
   * @param message - Description of the failure.
   * @param options - Standard ErrorOptions, including an optional original cause.
   */
  constructor(code: QgsErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}
