import "server-only";
import { z } from "zod";

/**
 * Server-only environment. Nothing here may be exposed to the browser:
 * never add NEXT_PUBLIC_ variables for secrets.
 */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "must be a PostgreSQL connection string (postgresql://...)"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Validates env without ever echoing values (they may contain credentials). */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment configuration — ${problems}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

/** Lazily validated so builds and pages that don't need the DB don't require it. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
