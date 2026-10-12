import "dotenv/config";
import { defineConfig } from "prisma/config";
import { readSecret } from "./src/config/secret";

// Same resolution as the app (zero-config dev, _FILE-capable): a fresh clone
// runs `bunx prisma migrate deploy` with no .env at all. 5436 = postgres
// default +4, ntumie.'s stack-wide local port offset.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: readSecret("DATABASE_URL") ?? "postgresql://postgres:postgres@127.0.0.1:5436/nslinkhub",
  },
});
