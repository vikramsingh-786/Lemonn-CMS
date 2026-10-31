"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setSourceDefault } from "@/features/research/source-settings";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";

const schema = z.object({ sourceId: z.string().max(40), enabled: z.boolean() });

/** Turns a news source on or off by default for everyone's new runs (admins only). */
export async function setDefault(
  sourceId: string,
  enabled: boolean,
): Promise<{ error: string | null }> {
  const me = await getCurrentUser();
  if (!me) return { error: "Your session has ended. Sign in again." };
  if (!can(me.role, "sources:manage")) return { error: "Only admins can change the defaults." };
  const parsed = schema.safeParse({ sourceId, enabled });
  if (!parsed.success || !(await setSourceDefault(parsed.data.sourceId, parsed.data.enabled)))
    return { error: "Unknown source." };
  revalidatePath("/admin/sources");
  return { error: null };
}
