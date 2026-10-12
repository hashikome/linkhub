import { HttpException } from "@nestjs/common";
import {
  type ApiErrorCode,
  type ApiErrorDetails,
  apiErrors,
  type EmptyDetails,
} from "@ntumie/types";

// Only this instance type is allowed to carry domain codes/details through the
// filter. A framework HttpException with a lookalike payload is not trusted.
export class AppException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    readonly details: ApiErrorDetails<ApiErrorCode>,
  ) {
    super(apiErrors[code].message, apiErrors[code].status);
  }
}
export function appError<C extends ApiErrorCode>(
  code: C,
  ...args: ApiErrorDetails<C> extends EmptyDetails ? [] : [details: ApiErrorDetails<C>]
): AppException {
  return new AppException(code, args[0] ?? {});
}
