import "server-only";
import { z } from "zod";

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined);

const DEFAULT_GEMINI_MODEL_FAST = "gemini-3.5-flash-lite";

/** Server-only environment. Empty values count as missing. Never send these to the browser. */
const schema = z
  .object({
    TAVILY_API_KEY: optional,
    GEMINI_API_KEY: optional,
    GEMINI_MODEL_FAST: optional,
    /** Legacy name, used when GEMINI_MODEL_FAST is unset. */
    GEMINI_MODEL: optional,
  })
  .transform(({ GEMINI_MODEL_FAST, GEMINI_MODEL, ...env }) => ({
    ...env,
    GEMINI_MODEL_FAST: GEMINI_MODEL_FAST ?? GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL_FAST,
  }))
  .refine((env) => /^[a-z0-9][a-z0-9.-]*$/.test(env.GEMINI_MODEL_FAST), {
    message: "GEMINI_MODEL_FAST must be a model id like gemini-3.5-flash-lite",
  });

export function serverEnv() {
  return schema.parse(process.env);
}
