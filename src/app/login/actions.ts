"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  clearAttempts,
  clientIp,
  createSession,
  endSession,
  isLimited,
  recordAttempt,
  safeNextPath,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { DUMMY_HASH, verifyPassword } from "@/lib/password";

/** The form's result; `values` refill the fields React clears after a submission (never passwords). */
export type AuthFormState = { error: string | null; values?: { email?: string; name?: string } };

const UNAVAILABLE = "Sign-in is unavailable right now. Try again in a minute.";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

/** Checks email + password (with attempt limits), starts a session and returns to `next`. */
export async function login(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    next: form.get("next") ?? undefined,
  });
  const typed = { email: String(form.get("email") ?? "").slice(0, 200) };
  if (!parsed.success) return { error: "Enter your email and password.", values: typed };
  const { email, password, next } = parsed.data;
  try {
    const ip = await clientIp();
    const keys = [
      { key: `email:${email}`, limit: "email" as const },
      { key: `ip:${ip}`, limit: "ip" as const },
    ];
    if (await isLimited(keys))
      return { error: "Too many failed attempts. Wait 15 minutes and try again.", values: typed };
    const user = await db().user.findUnique({ where: { email } });
    // Always run the hash check, so a missing account takes as long as a wrong password.
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      await recordAttempt(keys.map((k) => k.key));
      return { error: "Wrong email or password.", values: typed };
    }
    await clearAttempts(`email:${email}`);
    await createSession(user.id);
  } catch (e) {
    console.error("sign-in failed", e);
    return { error: UNAVAILABLE, values: typed };
  }
  redirect(safeNextPath(next));
}

/** Ends this browser's session for real (the session row is deleted) and goes to sign-in. */
export async function logout() {
  await endSession().catch((e: unknown) => console.error("sign-out failed", e));
  redirect("/login");
}
