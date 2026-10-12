import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { TelemetryNestLogger } from "./common/observability/telemetry";

export async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: new TelemetryNestLogger(),
    abortOnError: false,
  });

  configureApp(app);

  const config = new DocumentBuilder()
    .setTitle("ntumie. API")
    .setDescription(
      "ntumie. HTTP API (v1). Browsers authenticate with better-auth cookie " +
        "sessions; API clients and the extension use bearer tokens.",
    )
    .setVersion("1.0")
    .addBearerAuth()
    .addCookieAuth("better-auth.session_token")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("/api/docs", app, document);

  // 4004 by default: 3004 belongs to the web app (local +4 allocation). The
  // browser calls the API directly in dev; production ingress path-routes /api/*.
  // Local services stay on loopback; containers need a reachable interface.
  const host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
  await app.listen(process.env.PORT ?? 4004, host);
  return app;
}
