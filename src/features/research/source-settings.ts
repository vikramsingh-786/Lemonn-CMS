import "server-only";
import { DEFAULT_SOURCES, sourceDomain } from "@/features/dashboard/data";
import { db } from "@/lib/db";
import { needsTavily } from "./discovery";
import type { ConfiguredSource } from "./types";

/** Every source, on or off by the admins' choice (else the code default). */
export async function configuredSources(): Promise<ConfiguredSource[]> {
  const rows = await db().sourceSetting.findMany();
  const chosen = new Map(rows.map((r) => [r.sourceId, r.enabled]));
  return DEFAULT_SOURCES.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    domain: sourceDomain(s),
    enabled: chosen.get(s.id) ?? s.enabled,
    ...(s.note && { note: s.note }),
    paidSearch: needsTavily(s),
  }));
}

/** Sets whether a source is on by default. False for an unknown source id. */
export async function setSourceDefault(sourceId: string, enabled: boolean): Promise<boolean> {
  if (!DEFAULT_SOURCES.some((s) => s.id === sourceId)) return false;
  await db().sourceSetting.upsert({
    where: { sourceId },
    create: { sourceId, enabled },
    update: { enabled },
  });
  return true;
}
