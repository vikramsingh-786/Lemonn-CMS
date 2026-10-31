"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { AuthFormState } from "@/app/login/actions";
import { clientIp, createSession, isLimited, recordAttempt, safeNextPath } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { PASSWORD_MIN } from "@/lib/password-rules";

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
  try {
    const ip = await clientIp();
    if (await isLimited([{ key: `signup:${ip}`, limit: "signup" }]))
      return { error: "Too many new accounts from this network. Try again in an hour.", values };
    if (await db().user.findUnique({ where: { email }, select: { id: true } }))
      return { error: "An account with this email already exists. Sign in instead.", values };
    const user = await db().user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
    });
    await recordAttempt([`signup:${ip}`]);
    await createSession(user.id);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      return { error: "An account with this email already exists. Sign in instead.", values };
    console.error("sign-up failed", e);
    return { error: "Sign-up is unavailable right now. Try again in a minute.", values };
  }
  redirect(safeNextPath(next));
}
