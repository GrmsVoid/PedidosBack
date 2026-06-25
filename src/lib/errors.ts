export enum ErrorCode {
  TABLE_BUSY = "TABLE_BUSY",
  TABLE_NOT_FREE = "TABLE_NOT_FREE",
  PRODUCT_UNAVAILABLE = "PRODUCT_UNAVAILABLE",
  INVALID_STATE_TRANSITION = "INVALID_STATE_TRANSITION",
  MODIFIER_REQUIRED_MISSING = "MODIFIER_REQUIRED_MISSING",
  PAYMENT_INCOMPLETE = "PAYMENT_INCOMPLETE",
  ORDERS_IN_PROGRESS = "ORDERS_IN_PROGRESS",
  INVALID_QR_TOKEN = "INVALID_QR_TOKEN",
  SESSION_EXPIRED = "SESSION_EXPIRED",
  FORBIDDEN_ROLE = "FORBIDDEN_ROLE",
  NOT_FOUND = "NOT_FOUND",
  VALIDATION = "VALIDATION",
  THROTTLED = "THROTTLED",
  INTERNAL = "INTERNAL",
}

const HTTP_MAP: Record<ErrorCode, number> = {
  TABLE_BUSY: 409,
  TABLE_NOT_FREE: 409,
  PRODUCT_UNAVAILABLE: 409,
  INVALID_STATE_TRANSITION: 409,
  MODIFIER_REQUIRED_MISSING: 422,
  PAYMENT_INCOMPLETE: 409,
  ORDERS_IN_PROGRESS: 409,
  INVALID_QR_TOKEN: 401,
  SESSION_EXPIRED: 401,
  FORBIDDEN_ROLE: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  THROTTLED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type HttpErrorBody = {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> };
};

export function toHttpResponse(err: AppError): { status: number; body: HttpErrorBody } {
  return {
    status: HTTP_MAP[err.code],
    body: { error: { code: err.code, message: err.message, details: err.details } },
  };
}
