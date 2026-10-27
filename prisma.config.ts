import { defineConfig } from "prisma/config";

// Load .env for local CLI use (Node built-in; no dotenv dependency).
// In deployed environments variables come from the platform, so a missing file is fine.
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
