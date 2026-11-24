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

export const moduleDisabled = (module: string): AppError =>
  new AppError(403, "MODULE_DISABLED", "Module disabled", { module });

/** One `{ path, message }` per request field that names a missing or foreign row. */
export interface ReferenceIssue {
  message: string;
  path: (string | number)[];
}

/** 400 for IDs that don't name one of the household's rows. */
export const invalidReference = (issues: ReferenceIssue[]): AppError =>
  new AppError(400, "INVALID_REFERENCE", "Invalid reference", { issues });

export const emptyPatch = (): AppError =>
  new AppError(400, "EMPTY_PATCH", "Patch body has no fields");
