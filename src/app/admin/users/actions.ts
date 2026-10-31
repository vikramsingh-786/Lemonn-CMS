"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES, can } from "@/lib/roles";

export type RoleChangeResult = { error: string | null };

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
  const { count } = await db().user.updateMany({
    where: { id: parsed.data.userId },
    data: { role: parsed.data.role },
  });
  if (count === 0) return { error: "That account no longer exists." };
  revalidatePath("/admin/users");
  return { error: null };
}
