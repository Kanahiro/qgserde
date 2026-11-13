/**
 * エラーの分類。メッセージの文字列に依存せず、{@link QgsError.code} で判定できます。
 *
 * - `INVALID_XML`: 不正なXML、内部DTD、非対応XML形式、過剰な深さ等。
 * - `INVALID_PROJECT`: 不正なルート・必須属性・数値・真偽値等。
 * - `INVALID_VERSION`: 不正なバージョン表記、出力先未指定、対応範囲外の出力先。
 * - `INVALID_EDIT`: 重複ID・循環したツリー等の書き出せない編集。
 */
export type QgsErrorCode =
  | "INVALID_XML"
  | "INVALID_PROJECT"
  | "INVALID_VERSION"
  | "INVALID_EDIT";

/** コーデックが通知するエラー。{@link code} で失敗の種類を判別します。 */
export class QgsError extends Error {
  /** エラー名。常に`QgsError`です。 */
  override readonly name = "QgsError";
  /** 機械的に判別できるエラー分類。 */
  readonly code: QgsErrorCode;

  /**
   * 指定した分類のエラーを作成します。
   * @param code - エラー分類。
   * @param message - 人間向けの説明。
   * @param options - 元の例外をcauseとして保持するための標準ErrorOptions。
   */
  constructor(code: QgsErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}
