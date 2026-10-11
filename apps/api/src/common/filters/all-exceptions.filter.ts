import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import { type ApiError, type ApiErrorCode, type ApiErrorDetails, apiErrors } from "@linkhub/types";
import type { Response } from "express";
import { AppException } from "../errors/app-exception";
import type { RequestWithId } from "../middleware/request-id";
import { requestRoute } from "../observability/http-telemetry";
import { captureFailure } from "../observability/telemetry";

const statusCodes: Record<number, ApiErrorCode> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  408: "request_timeout",
  409: "conflict",
  413: "payload_too_large",
  415: "unsupported_media_type",
  429: "too_many_requests",
  503: "service_unavailable",
};

export function errorResponse(
  exception: unknown,
  requestId: string,
): { status: number; body: ApiError; unexpected: boolean } {
  const trusted = exception instanceof AppException;
  const status = exception instanceof HttpException ? exception.getStatus() : 500;
  const code = trusted
    ? exception.code
    : (statusCodes[status] ?? (status >= 500 ? "internal_error" : "bad_request"));
  let details: ApiErrorDetails<ApiErrorCode> = {};
  if (trusted && code === "dependencies_unavailable" && "dependencies" in exception.details) {
    const deps = exception.details.dependencies;
    details = {
      dependencies: {
        postgres: deps.postgres === "ready" ? "ready" : "unavailable",
        redisQueue: deps.redisQueue === "ready" ? "ready" : "unavailable",
      },
    };
  } else if (trusted && code === "validation_failed" && "issues" in exception.details) {
    details = {
      issues: exception.details.issues.slice(0, 32).map(({ field, rule }) => ({ field, rule })),
    };
  }
  // Bodies/messages on ordinary HttpExceptions (including lookalike domain
  // payloads) and arbitrary thrown objects are never forwarded.
  const body = {
    error: { code, message: apiErrors[code].message, requestId, details },
  } as ApiError;
  return { status: apiErrors[code].status, body, unexpected: !trusted && status >= 500 };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const requestId = request.requestId ?? "req_unknown";
    const result = errorResponse(exception, requestId);
    if (result.unexpected)
      captureFailure(exception, {
        "request.id": requestId,
        "http.route": requestRoute(request),
        "http.status_code": result.status,
      });
    response.status(result.status).json(result.body);
  }
}
