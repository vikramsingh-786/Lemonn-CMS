"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
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
