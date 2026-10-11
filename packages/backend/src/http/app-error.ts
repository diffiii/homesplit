export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (): AppError =>
  new AppError(404, "NOT_FOUND", "Not found");

export const forbidden = (): AppError =>
  new AppError(403, "FORBIDDEN", "Forbidden");
