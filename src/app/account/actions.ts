"use server";

import { z } from "zod";
import { PASSWORD_MIN } from "@/lib/password-rules";
import { currentSessionId, endOtherSessions, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

export type AccountState = { error: string | null; done: string | null };

const passwordSchema = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(200),
});

/** Changes the password and signs this account out on every other device. */
export async function changePassword(_p: AccountState, form: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Your session has ended. Sign in again.", done: null };
  const parsed = passwordSchema.safeParse({ current: form.get("current"), next: form.get("next") });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the form.", done: null };
  const row = await db().user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!row || !(await verifyPassword(parsed.data.current, row.passwordHash)))
    return { error: "Your current password is wrong.", done: null };
  await db().user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.next) },
  });
  const ended = await endOtherSessions(user.id, await currentSessionId());
  return {
    error: null,
    done: `Password changed. Signed out ${ended} other device${ended === 1 ? "" : "s"}.`,
  };
}

/** Signs this account out everywhere except this browser. */
export async function signOutOtherDevices(): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Your session has ended. Sign in again.", done: null };
  const ended = await endOtherSessions(user.id, await currentSessionId());
  return { error: null, done: `Signed out ${ended} other device${ended === 1 ? "" : "s"}.` };
}
