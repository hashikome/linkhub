import type { ApiSuccess } from "@ntumie/types";

export function apiOk<T, M = undefined>(data: T, meta?: M): ApiSuccess<T, M> {
  return { data, ...(meta ? { meta } : {}) };
}
