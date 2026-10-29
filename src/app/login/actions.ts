"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  createSessionToken,
  passwordMatches,
  safeNextPath,
} from "@/lib/session";

export type LoginState = { error: string | null };

const loginSchema = z.object({
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

/** Checks the password, sets the signed session cookie and returns to the requested page. */
export async function login(_previous: LoginState, form: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    password: form.get("password"),
    next: form.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: "Enter the password." };
  if (!(await passwordMatches(parsed.data.password))) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // slows down guessing
    return { error: "Wrong password." };
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  redirect(safeNextPath(parsed.data.next));
}

/** Clears the session and returns to the sign-in page. */
export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
