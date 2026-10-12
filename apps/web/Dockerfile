FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS build
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run web:build

FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4
WORKDIR /app
COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/packages ./packages
COPY --from=build --chown=bun:bun /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build --chown=bun:bun /app/apps/web/.next ./apps/web/.next
COPY --from=build --chown=bun:bun /app/apps/web/public ./apps/web/public
COPY --from=build --chown=bun:bun /app/apps/web/server ./apps/web/server
COPY --from=build --chown=bun:bun /app/apps/web/server.ts /app/apps/web/next.config.ts /app/apps/web/package.json /app/apps/web/tsconfig.json ./apps/web/
COPY --from=build --chown=bun:bun /app/package.json /app/bun.lock ./
WORKDIR /app/apps/web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 WEB_HOST=0.0.0.0 WEB_PORT=3000
USER bun
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=4s --start-period=30s --retries=3 CMD ["bun", "-e", "const r=await fetch('http://127.0.0.1:3000/healthz',{signal:AbortSignal.timeout(2500),redirect:'manual'});process.exit(r.status===200?0:1)"]
# Preserve server-side source attribution; do not use a generic Next server.
CMD ["bun", "server.ts"]
