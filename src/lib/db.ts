import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/** The CMS's own PostgreSQL (DATABASE_URL). One client per server process, reused across reloads. */
export function db(): PrismaClient {
  const g = globalThis as { __prisma?: PrismaClient };
  if (!g.__prisma) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.__prisma = new PrismaClient({ adapter: new PrismaPg(url) });
  }
  return g.__prisma;
}
