import type { ApiError } from "@homesplit/contracts";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { AppError } from "./app-error";

interface HttpResponse {
  status: (code: number) => { json: (body: unknown) => void };
}

interface ErrorReply {
  body: ApiError;
  status: number;
}

const CONFLICT_CODES = new Set(["23505", "23503"]);

const CLIENT_ERRORS = new Map([
  [400, { code: "VALIDATION_ERROR", message: "Invalid request" }],
  [401, { code: "UNAUTHENTICATED", message: "Authentication required" }],
  [403, { code: "FORBIDDEN", message: "Forbidden" }],
  [404, { code: "NOT_FOUND", message: "Not found" }],
  [413, { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" }],
  [415, { code: "UNSUPPORTED_MEDIA_TYPE", message: "Unsupported encoding" }],
]);

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = this.toReply(exception);
    host.switchToHttp().getResponse<HttpResponse>().status(status).json(body);
  }

  private toReply(exception: unknown): ErrorReply {
    if (exception instanceof AppError) {
      return reply(
        exception.status,
        exception.code,
        exception.message,
        exception.details
      );
    }

    const status = statusOf(exception);
    const clientError = CLIENT_ERRORS.get(status);
    if (clientError) {
      const details =
        status === 400 && exception instanceof Error
          ? { issues: [{ path: [], message: exception.message }] }
          : undefined;
      return reply(status, clientError.code, clientError.message, details);
    }
    if (isConstraintViolation(exception)) {
      return reply(409, "CONFLICT", "Conflicts with existing data");
    }

    this.logger.error(exception);
    return reply(500, "INTERNAL_ERROR", "Internal server error");
  }
}

function reply(
  status: number,
  code: string,
  message: string,
  details?: unknown
): ErrorReply {
  return { status, body: { code, message, details } };
}

function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  const status = (exception as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : 500;
}

function isConstraintViolation(exception: unknown): boolean {
  const code = (exception as { cause?: { code?: unknown } } | null)?.cause
    ?.code;
  return typeof code === "string" && CONFLICT_CODES.has(code);
}
