import "server-only";
import { z } from "zod";

/** Empty values count as missing. */
const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined);

const modelId = (name: string, fallback: string) =>
  optional
    .transform((v) => v ?? fallback)
    .pipe(z.string().regex(/^[a-z0-9][a-z0-9.-]*$/, `${name} must be a model id like ${fallback}`));

const MAX_VERIFY_ERROR = "NEWS_RESEARCH_MAX_VERIFY must be a whole number from 1 to 20";

/** Server-only environment. Errors name the variable, never its value. Never send to the browser. */
const schema = z
  .object({
    TAVILY_API_KEY: optional,
    GEMINI_API_KEY: optional,
    /** Legacy name, used when GEMINI_MODEL_FAST is unset. */
    GEMINI_MODEL: optional,
    GEMINI_MODEL_FAST: optional,
    GEMINI_MODEL_REASONING: modelId("GEMINI_MODEL_REASONING", "gemini-3.8-flash"),
    NEWS_RESEARCH_MAX_VERIFY: optional
      .transform((v) => (v === undefined ? 12 : Number(v)))
      .pipe(
        z
          .number(MAX_VERIFY_ERROR)
          .int(MAX_VERIFY_ERROR)
          .min(1, MAX_VERIFY_ERROR)
          .max(20, MAX_VERIFY_ERROR),
      ),
  })
  .transform(({ GEMINI_MODEL, GEMINI_MODEL_FAST, ...env }) => ({
    ...env,
    GEMINI_MODEL_FAST: GEMINI_MODEL_FAST ?? GEMINI_MODEL ?? "gemini-3.5-flash-lite",
  }))
  .refine((env) => /^[a-z0-9][a-z0-9.-]*$/.test(env.GEMINI_MODEL_FAST), {
    message: "GEMINI_MODEL_FAST must be a model id like gemini-3.5-flash-lite",
  });

export type ServerEnv = z.infer<typeof schema>;

export function serverEnv(): ServerEnv {
  return schema.parse(process.env);
}
