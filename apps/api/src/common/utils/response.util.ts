import type { ApiSuccess } from "@linkhub/types";

export function apiOk<T, M = undefined>(data: T, meta?: M): ApiSuccess<T, M> {
  return { data, ...(meta ? { meta } : {}) };
}
