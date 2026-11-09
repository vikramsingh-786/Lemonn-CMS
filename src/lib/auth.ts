import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { ROLE_LABEL, can, toRole, type Permission, type SessionUser } from "@/lib/roles";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/** Signed out after 7 days without use; at most 30 days after signing in. */
const IDLE_MS = 7 * 24 * 3_600_000;
const ABSOLUTE_MS = 30 * 24 * 3_600_000;
/** lastSeenAt / expiresAt are written at most this often (not on every request). */
const TOUCH_MS = 3_600_000;

const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");

/** Starts a session for `userId` and sets the cookie (server actions only). */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await db().session.create({
    data: { id: tokenId(token), userId, expiresAt: new Date(Date.now() + IDLE_MS) },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ABSOLUTE_MS / 1000,
  });
}

/**
 * The signed-in account for this request, or null. Checked against the database every time,
 * so signing out, a deleted session or a role change takes effect at once. Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const id = tokenId(token);
  const session = await db().session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;
  const now = Date.now();
  const hardEnd = session.createdAt.getTime() + ABSOLUTE_MS;
  if (session.expiresAt.getTime() <= now || hardEnd <= now) {
    await db()
      .session.delete({ where: { id } })
      .catch(() => {});
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_MS) {
    // Sliding expiry: active editors stay signed in (up to the 30-day limit).
    await db()
      .session.update({
        where: { id },
        data: { lastSeenAt: new Date(now), expiresAt: new Date(Math.min(now + IDLE_MS, hardEnd)) },
      })
      .catch(() => {});
  }
  const { user } = session;
  return { id: user.id, email: user.email, name: user.name, role: toRole(user.role) };
});

/** The current session's id (to keep it when signing out other devices). */
export async function currentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? tokenId(token) : null;
}

/** Signs this browser out: deletes the session row and the cookie (server actions only). */
export async function endSession(): Promise<void> {
  const id = await currentSessionId();
  if (id) await db().session.deleteMany({ where: { id } });
  (await cookies()).delete(SESSION_COOKIE);
}

/** Signs a user out everywhere except (optionally) one session. */
export async function endOtherSessions(userId: string, keepId: string | null): Promise<number> {
  const { count } = await db().session.deleteMany({
    where: { userId, ...(keepId && { id: { not: keepId } }) },
  });
  return count;
}

/** For pages: the signed-in account, or a redirect to sign in (returning to `nextPath`). */
export async function requireUser(nextPath = "/"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}&expired=1`);
  return user;
}

const ACTION_LABEL: Record<Permission, string> = {
  "research:run": "run research",
  "articles:edit": "edit articles",
  "users:manage": "manage accounts",
  "runs:manage": "manage research runs",
  "sources:manage": "change the default news sources",
};

/**
 * For route handlers: the account, or a JSON 401 (not signed in) / 403 (role not allowed)
 * response to return as is.
 */
export async function requireApi(
  permission?: Permission,
): Promise<{ user: SessionUser; denied?: undefined } | { user?: undefined; denied: Response }> {
  const user = await getCurrentUser();
  const headers = { "Cache-Control": "no-store" };
  if (!user)
    return {
      denied: Response.json(
        {
          error: {
            code: "unauthorized",
            message: "Your session has ended. Sign in again.",
            retryable: false,
          },
        },
        { status: 401, headers },
      ),
    };
  if (permission && !can(user.role, permission))
    return {
      denied: Response.json(
        {
          error: {
            code: "forbidden",
            message: `Your role (${ROLE_LABEL[user.role]}) can't ${ACTION_LABEL[permission]}. Ask an admin for access.`,
            retryable: false,
          },
        },
        { status: 403, headers },
      ),
    };
  return { user };
}

/**
 * Where to go after signing in: a same-site path only. Browsers drop tabs and newlines from URLs
 * and read "\\" as "/", so "/\t/evil.example" or "/\\evil.example" would leave the site; any control
 * character or backslash means "/".
 */
export function safeNextPath(next: string | undefined | null): string {
  return next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(next)
    ? next
    : "/";
}

/* ---------- Attempt limiting ---------- */

/** Attempts allowed per key within the window (attempts are counted before they are checked). */
export const LIMITS = {
  /** Sign-ins for one email from one network address (the owner's own typos). */
  emailIp: { max: 5, windowMs: 15 * 60_000 },
  /**
   * Failed sign-ins for one email from anywhere. Higher than emailIp, so someone else guessing
   * from elsewhere can't lock the owner out with 5 wrong passwords, while guessing stays capped.
   */
  email: { max: 20, windowMs: 15 * 60_000 },
  /** Sign-ins from one network address (any email). */
  ip: { max: 30, windowMs: 15 * 60_000 },
  /** New accounts (and attempts at them) from one network address. */
  signup: { max: 5, windowMs: 60 * 60_000 },
} as const;

/**
 * The caller's network address for attempt limits, or null when it isn't known. X-Forwarded-For
 * is whatever the client sends unless a trusted proxy overwrites it, so it is used only on Vercel
 * (which sets it) or when TRUST_PROXY_HEADERS=1 says a proxy does. Without it, per-address limits
 * are skipped (a shared bucket would let anyone lock everyone out); per-email limits still apply.
 */
export async function clientIp(): Promise<string | null> {
  if (process.env.VERCEL !== "1" && process.env.TRUST_PROXY_HEADERS !== "1") return null;
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/**
 * Records one attempt for each key, then counts: true when any key is over its limit (this attempt
 * included). Counting after recording makes parallel attempts see each other, so a burst can't
 * all slip under the limit. Returns the ids of the rows added (removed again on success).
 */
export async function takeAttempt(
  keys: { key: string; limit: keyof typeof LIMITS }[],
): Promise<{ limited: boolean; ids: string[] }> {
  const rows = await db().loginAttempt.createManyAndReturn({
    data: keys.map(({ key }) => ({ key })),
    select: { id: true },
  });
  const counts = await Promise.all(
    keys.map(({ key, limit }) =>
      db().loginAttempt.count({
        where: { key, createdAt: { gt: new Date(Date.now() - LIMITS[limit].windowMs) } },
      }),
    ),
  );
  await db().loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 24 * 3_600_000) } },
  });
  return {
    limited: counts.some((count, i) => count > LIMITS[keys[i]!.limit].max),
    ids: rows.map((r) => r.id),
  };
}

/** Forgets attempts: by row id (a successful sign-in) and/or by key. */
export async function clearAttempts({ ids = [], keys = [] }: { ids?: string[]; keys?: string[] }) {
  await db().loginAttempt.deleteMany({
    where: { OR: [{ id: { in: ids } }, { key: { in: keys } }] },
  });
}
