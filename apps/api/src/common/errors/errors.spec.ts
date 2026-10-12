import { describe, expect, it } from "bun:test";
import { BadRequestException, HttpException, ServiceUnavailableException } from "@nestjs/common";
import { isApiErrorCode } from "@ntumie/types";
import { errorResponse } from "../filters/all-exceptions.filter";
import { appError } from "./app-exception";

describe("safe application errors", () => {
  it("never reflects arbitrary thrown values or framework exception bodies", () => {
    const secret = "never-export-email@example.com SELECT password secret-token";
    for (const error of [
      secret,
      { status: 400, message: secret },
      new Error(secret),
      new HttpException({ code: secret, message: secret, details: { sql: secret } }, 500),
      new BadRequestException({
        code: "validation_failed",
        message: [secret],
        details: { values: secret },
      }),
      new ServiceUnavailableException({ code: "dependencies_unavailable", details: { secret } }),
    ]) {
      const result = errorResponse(error, "req_fixed");
      expect(JSON.stringify(result)).not.toContain("never-export");
      expect(result.body.error.details).toEqual({});
      expect(result.body.error.requestId).toBe("req_fixed");
      expect(isApiErrorCode(result.body.error.code)).toBe(true);
    }
  });
  it("keeps explicit domain codes and only the declared readiness shape", () => {
    const unavailable = errorResponse(new ServiceUnavailableException("private"), "req_fixed");
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.error.code).toBe("service_unavailable");
    expect(errorResponse(appError("version_conflict"), "req_fixed").body.error.code).toBe(
      "version_conflict",
    );
    const result = errorResponse(
      appError("dependencies_unavailable", {
        dependencies: {
          postgres: "unavailable",
          redisQueue: "ready",
        },
      }),
      "req_fixed",
    );
    expect(result.status).toBe(503);
    expect(result.unexpected).toBe(false);
    expect(result.body.error.details).toEqual({
      dependencies: { postgres: "unavailable", redisQueue: "ready" },
    });
  });
  it("recognizes only declared error codes, excluding prototype names", () => {
    for (const code of ["future_server_code", "__proto__", "constructor", null, {}]) {
      expect(isApiErrorCode(code)).toBe(false);
    }
    expect(isApiErrorCode("version_conflict")).toBe(true);
  });
});
