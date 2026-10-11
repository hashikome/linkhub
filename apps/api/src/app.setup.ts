import { INestApplication, ValidationPipe } from "@nestjs/common";
import { publicOrigins } from "@linkhub/config/public-origins";
import { toNodeHandler } from "better-auth/node";
import type { Express } from "express";
import { json, raw, urlencoded } from "express";
import { auth } from "./auth/auth";
import { validationException } from "./common/errors/validation";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { browserBoundary } from "./common/middleware/browser-boundary";
import { browserCors } from "./common/middleware/browser-cors";
import { requestBudget, trustedProxies } from "./common/middleware/request-budget";
import { requestIdMiddleware } from "./common/middleware/request-id";
import { httpTelemetry } from "./common/observability/http-telemetry";
import { readSecret } from "./config/secret";
import { PrismaService } from "./database/prisma.service";
import { resendWebhook } from "./email/webhook";

// Shared between main.ts and the e2e tests so both run the same HTTP stack.
// Requires the app to be created with `bodyParser: false`: the better-auth
// handler must see the raw request, so parsers are re-added after its mount.
// Order matters: request-id first (so even auth responses carry it), then the
// better-auth handler, then body parsers for Nest routes.
export function configureApp(app: INestApplication): void {
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set("trust proxy", trustedProxies(process.env.TRUSTED_PROXY_CIDRS));
  expressApp.use(requestIdMiddleware);
  expressApp.use(httpTelemetry);
  const { webOrigin } = publicOrigins(process.env);
  expressApp.use("/api/v1", browserCors(webOrigin), browserBoundary(webOrigin));
  expressApp.use(requestBudget(app.get(PrismaService)));
  expressApp.all("/api/v1/auth/{*any}", toNodeHandler(auth));

  expressApp.post(
    "/api/v1/webhooks/resend",
    raw({ type: "application/json", limit: "64kb" }),
    resendWebhook(app.get(PrismaService), readSecret("RESEND_WEBHOOK_SECRET")),
  );

  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      validationError: { target: true, value: false },
      exceptionFactory: validationException,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
}
