"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { AuthFormState } from "@/app/login/actions";
import { clientIp, createSession, safeNextPath, takeAttempt } from "@/lib/auth";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { hashPassword } from "@/lib/password";
import { PASSWORD_MIN } from "@/lib/password-rules";

/** Doesn't say whether the email has an account (no probing for colleagues' addresses). */
const EXISTS_OR_INVALID =
  "We couldn't create an account with these details. If you already have one, sign in instead.";

const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  password: z
    .string()
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
    .max(200, "Use at most 200 characters."),
  next: z.string().max(500).optional(),
});

/**
 * Creates an account with the "user" role (read-only) and signs it in. An admin grants more by
 * changing the role in the database. New accounts per network address are limited.
 */
export async function signup(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    password: form.get("password"),
    next: form.get("next") ?? undefined,
  });
  const values = {
    name: String(form.get("name") ?? "").slice(0, 80),
    email: String(form.get("email") ?? "").slice(0, 200),
  };
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the form.", values };
  const { name, email, password, next } = parsed.data;
  if (password.toLowerCase().includes(email.split("@")[0]!.toLowerCase()))
    return { error: "Don't use your email name in the password.", values };
  const domains = serverEnv().SIGNUP_ALLOWED_DOMAINS;
  if (domains && !domains.includes(email.split("@")[1]!))
    return { error: "Use your work email address to create an account.", values };
  try {
    const ip = await clientIp();
    // Every attempt counts (also for an existing email), so the limit also caps probing for emails.
    if (ip && (await takeAttempt([{ key: `signup:${ip}`, limit: "signup" }])).limited)
      return { error: "Too many new accounts from this network. Try again in an hour.", values };
    if (await db().user.findUnique({ where: { email }, select: { id: true } }))
      return { error: EXISTS_OR_INVALID, values };
    const user = await db().user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
    });
    await createSession(user.id);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: EXISTS_OR_INVALID, values };
    console.error("sign-up failed", e);
    return { error: "Sign-up is unavailable right now. Try again in a minute.", values };
  }
  redirect(safeNextPath(next));
}
