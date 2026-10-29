import "server-only";
import { cookies } from "next/headers";

/**
 * Single shared-password sign-in (prototype). The session cookie holds an expiry signed with
 * AUTH_SECRET (HMAC-SHA256), so it can't be forged or extended; changing AUTH_SECRET signs
 * everyone out. Server-only env: ADMIN_PASSWORD, AUTH_SECRET (≥ 32 characters).
 */
export const SESSION_COOKIE = "lemonn_session";
export const SESSION_MAX_AGE_S = 7 * 24 * 3600;

const encoder = new TextEncoder();

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (at least 32 characters)");
  return s;
}

function base64url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

/** Constant-time comparison of equal-length strings (signatures/digests). */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when `input` is ADMIN_PASSWORD (compared as signatures, so timing leaks nothing). */
export async function passwordMatches(input: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return same(await sign(`password:${input}`), await sign(`password:${expected}`));
}

/** A new session token valid for SESSION_MAX_AGE_S. */
export async function createSessionToken(now = Date.now()): Promise<string> {
  const payload = `v1.${now + SESSION_MAX_AGE_S * 1000}`;
  return `${payload}.${await sign(payload)}`;
}

/** True for an unexpired token signed with AUTH_SECRET; false for anything else (never throws). */
export async function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  try {
    const [version, expires, signature] = (token ?? "").split(".");
    if (version !== "v1" || !expires || !signature || !(Number(expires) > now)) return false;
    return same(signature, await sign(`${version}.${expires}`));
  } catch {
    return false;
  }
}

/** For route handlers: a 401 response when the request has no valid session, else null. */
export async function requireApiSession(): Promise<Response | null> {
  if (await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value)) return null;
  return Response.json(
    { error: { code: "unauthorized", message: "Sign in required.", retryable: false } },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

/** Where to go after signing in: a same-site path only (never "//host" or a full URL). */
export function safeNextPath(next: string | undefined | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/";
}
