import { ApiError } from "@homesplit/contracts";
import { z } from "zod";

/** Which backend surface answered: an application route under `/api`, or Better Auth under `/api/auth`. */
export type ErrorSource = "api" | "auth";

/** No response arrived, so there's no HTTP status. */
export const NO_STATUS = 0;

/**
 * Codes for answers whose body isn't an `ApiError`, such as a Better Auth rate
 * limit or a proxy error page. They match the backend's codes for each status.
 */
const FALLBACK_CODES = new Map([
  [401, "UNAUTHENTICATED"],
  [403, "FORBIDDEN"],
  [404, "NOT_FOUND"],
  [409, "CONFLICT"],
  [413, "PAYLOAD_TOO_LARGE"],
  [415, "UNSUPPORTED_MEDIA_TYPE"],
  [429, "RATE_LIMITED"],
]);

const LooseErrorBody = z.object({
  code: z.string().min(1).optional().catch(undefined),
  message: z.string().min(1).optional().catch(undefined),
});

/** `details` of `VALIDATION_ERROR` and `INVALID_REFERENCE`. */
const IssueDetails = z.object({
  issues: z.array(
    z.object({
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
    })
  ),
});
export type Issue = z.infer<typeof IssueDetails>["issues"][number];

/**
 * Every failed request, from `/api` routes and from `/api/auth/*` alike.
 * Branch on `status` and `code`; `message` is English text for developers.
 */
export class ApiRequestError extends Error {
  override readonly name = "ApiRequestError";
  /** HTTP status, or `NO_STATUS` when no response arrived. */
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly source: ErrorSource;

  constructor(
    source: ErrorSource,
    status: number,
    { code, message, details }: ApiError,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.source = source;
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Error answer with a body that may or may not be an `ApiError`. */
  static fromBody(
    source: ErrorSource,
    status: number,
    body: unknown,
    statusText = ""
  ): ApiRequestError {
    const parsed = ApiError.safeParse(body);
    if (parsed.success) {
      return new ApiRequestError(source, status, parsed.data);
    }
    const loose = LooseErrorBody.safeParse(body);
    const { code, message } = loose.success ? loose.data : {};
    return new ApiRequestError(source, status, {
      code: code ?? fallbackCode(status),
      message: message ?? (statusText || `Request failed with ${status}`),
    });
  }

  /** The request never got an answer, for example because the network is down. */
  static network(source: ErrorSource, cause: unknown): ApiRequestError {
    return new ApiRequestError(
      source,
      NO_STATUS,
      { code: "NETWORK_ERROR", message: "No response from the server" },
      { cause }
    );
  }

  /** A success answer that doesn't match the endpoint's response schema. */
  static invalidResponse(
    source: ErrorSource,
    status: number,
    cause: unknown
  ): ApiRequestError {
    return new ApiRequestError(
      source,
      status,
      {
        code: "INVALID_RESPONSE",
        message: "Response doesn't match its schema",
      },
      { cause }
    );
  }
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

/** `details.issues` of a validation or reference error, or an empty list. */
export function issuesOf(error: unknown): Issue[] {
  if (!isApiRequestError(error)) {
    return [];
  }
  const parsed = IssueDetails.safeParse(error.details);
  return parsed.success ? parsed.data.issues : [];
}

/**
 * Issue messages by form field name, the issue path joined with dots, such as
 * `payers.0.amount`. The first message for a path wins, and issues with an
 * empty path are left out, since they belong to no field.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const { path, message } of issuesOf(error)) {
    const name = path.join(".");
    if (name && !(name in errors)) {
      errors[name] = message;
    }
  }
  return errors;
}

function fallbackCode(status: number): string {
  if (status >= 500) {
    return "INTERNAL_ERROR";
  }
  return FALLBACK_CODES.get(status) ?? "UNKNOWN_ERROR";
}
