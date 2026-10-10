import type { NextFunction, Request, Response } from "express";

// CORS grants browser reads, never authentication. CSRF checks remain separate.
export function browserCors(webOrigin: string) {
  const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];
  const headers = ["content-type", "x-share-token", "idempotency-key"];
  return (req: Request, res: Response, next: NextFunction) => {
    res.vary("Origin");
    const origin = req.headers.origin;
    const allowed = origin === webOrigin;
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", webOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Expose-Headers", "x-request-id, retry-after");
    }
    if (req.method === "OPTIONS" && origin) {
      res.vary("Access-Control-Request-Method");
      res.vary("Access-Control-Request-Headers");
      const method = req.get("access-control-request-method");
      const requestedHeaders = (req.get("access-control-request-headers") ?? "")
        .split(",")
        .map((header) => header.trim().toLowerCase())
        .filter(Boolean);
      if (
        !allowed ||
        !method ||
        !methods.includes(method) ||
        requestedHeaders.some((header) => !headers.includes(header))
      ) {
        res.sendStatus(403);
        return;
      }
      res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
      res.setHeader("Access-Control-Allow-Headers", headers.join(", "));
      res.sendStatus(204);
      return;
    }
    next();
  };
}
