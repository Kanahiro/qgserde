/**
 * Error categories available through {@link QgsError.code}.
 *
 * - `INVALID_XML`: Malformed or unsupported XML, internal DTD subsets, or excessive depth.
 * - `INVALID_PROJECT`: Invalid root, required attributes, or modeled values.
 * - `INVALID_VERSION`: Invalid version syntax, a missing target, or an unsupported target major version.
 * - `INVALID_EDIT`: Duplicate IDs, cycles, edits that would lose data, or other invalid model data.
 */
export type QgsErrorCode =
  | "INVALID_XML"
  | "INVALID_PROJECT"
  | "INVALID_VERSION"
  | "INVALID_EDIT";

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
