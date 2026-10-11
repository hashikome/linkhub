# Migrations

Prisma Migrate owns the schema. Migrations live in `apps/api/prisma/migrations`;
configuration (including the datasource URL) lives in `apps/api/prisma.config.ts`.
Run all Prisma CLI commands from `apps/api`.

## Rules

- **Never trust an auto-generated diff blindly.** Several database objects
  exist only in migration SQL and are invisible to the Prisma schema: the
  `public.app_uuid_v7()` function, `set_updated_at` triggers, the
  CHECK constraints, and partial unique
  indexes. An unreviewed diff will try to drop them.
- Evolve the schema with `bunx prisma migrate dev --create-only`, review and
  edit the generated SQL, then apply.
- The chain starts at `0_init`, a schema dump that preserves SQL-only objects.
  New schema work uses reviewed additive migrations on top. Until production exists, a further squash is
  allowed with the same method (apply the chain to a scratch database, dump the
  schema, confirm `migrate diff` reports no difference) plus a local reset;
  never rewrite migrations applied in production.
- Verify parity after schema work:
  `bunx prisma migrate diff --from-config-datasource --to-schema
  prisma/schema.prisma` must report "No difference detected".

## Applying

```bash
cd apps/api
bunx prisma migrate deploy   # applies pending migrations (local + production)
bunx prisma migrate status   # inspection
```

In production (per `docs/design-docs/infra-deployment.md`), `migrate deploy`
runs as an explicit release step ordered before the new app version serves
traffic — never via `depends_on` and never automatically at app boot.

## Fresh Database Check

Migrations must always work from empty. Cheap check against the local server:

```bash
docker exec linkhub-postgres psql -U postgres -c "CREATE DATABASE scratch"
cd apps/api && DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5436/scratch" \
  bunx prisma migrate deploy
docker exec linkhub-postgres psql -U postgres -c "DROP DATABASE scratch"
```
