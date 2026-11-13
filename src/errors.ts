export type QgsErrorCode =
  | "INVALID_XML"
  | "INVALID_PROJECT"
  | "INVALID_VERSION"
  | "MIGRATION_REQUIRED"
  | "INVALID_EDIT";

export class QgsError extends Error {
  override readonly name = "QgsError";
  readonly code: QgsErrorCode;

  constructor(code: QgsErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}
