import "server-only";
import { z } from "zod";

/** Server-only environment. Empty values count as missing. Never send these to the browser. */
const schema = z.object({
  TAVILY_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
});

export function serverEnv() {
  return schema.parse(process.env);
}
