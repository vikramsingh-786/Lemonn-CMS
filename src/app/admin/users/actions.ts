"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { endOtherSessions, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { PASSWORD_MIN } from "@/lib/password-rules";
import { ROLES, can, toRole } from "@/lib/roles";

export type RoleChangeResult = { error: string | null };

/** Advisory lock id that serialises role changes. */
const ROLE_LOCK = 0x526f6c65; // "Role"

const schema = z.object({ userId: z.uuid(), role: z.enum(ROLES) });

/**
 * Sets another account's role. Admins only; an admin can't change their own role, so the one
 * making changes always stays admin (there is never zero admins). Applies on the account's next
 * request: roles are read from the database on every request.
 */
export async function setRole(userId: string, role: string): Promise<RoleChangeResult> {
  const me = await getCurrentUser();
  if (!me) return { error: "Your session has ended. Sign in again." };
  if (!can(me.role, "users:manage")) return { error: "Only admins can change roles." };
  const parsed = schema.safeParse({ userId, role });
  if (!parsed.success) return { error: "Unknown account or role." };
  if (parsed.data.userId === me.id)
    return { error: "You can't change your own role. Ask another admin." };
  // Serialised, and the caller's role re-read inside: two admins demoting each other at the same
  // moment can't both succeed, so there is always an admin.
  const error = await db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ROLE_LOCK})`;
    const caller = await tx.user.findUnique({ where: { id: me.id }, select: { role: true } });
    if (!caller || !can(toRole(caller.role), "users:manage"))
      return "Only admins can change roles.";
    const target = await tx.user.findUnique({
      where: { id: parsed.data.userId },
      select: { role: true },
    });
    if (!target) return "That account no longer exists.";
    if (target.role === "admin" && parsed.data.role !== "admin") {
      const admins = await tx.user.count({ where: { role: "admin" } });
      if (admins <= 1) return "This is the last admin account.";
    }
    await tx.user.update({ where: { id: parsed.data.userId }, data: { role: parsed.data.role } });
    return null;
  });
  if (error) return { error };
  revalidatePath("/admin/users");
  return { error: null };
}

const passwordSchema = z.object({
  userId: z.uuid(),
  password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(200),
});

/**
 * Sets another account's password (for someone locked out; the app can't send email) and signs
 * them out everywhere. Admins only; their own password is changed on /account.
 */
export async function setPassword(userId: string, password: string): Promise<RoleChangeResult> {
  const me = await getCurrentUser();
  if (!me) return { error: "Your session has ended. Sign in again." };
  if (!can(me.role, "users:manage")) return { error: "Only admins can set passwords." };
  const parsed = passwordSchema.safeParse({ userId, password });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the password." };
  if (parsed.data.userId === me.id)
    return { error: "Change your own password on your Account page." };
  const passwordHash = await hashPassword(parsed.data.password);
  const { count } = await db().user.updateMany({
    where: { id: parsed.data.userId },
    data: { passwordHash },
  });
  if (!count) return { error: "That account no longer exists." };
  await endOtherSessions(parsed.data.userId, null);
  return { error: null };
}
