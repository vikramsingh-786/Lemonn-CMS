import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * A quick first gate: no session cookie → pages redirect to /login (keeping the page to return
 * to), API calls get 401. It doesn't touch the database; every page and route handler checks the
 * session and the role itself (requireUser / requireApi in src/lib/auth.ts).
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/"))
    return Response.json(
      {
        error: {
          code: "unauthorized",
          message: "Your session has ended. Sign in again.",
          retryable: false,
        },
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  const login = new URL("/login", request.url);
  if (pathname + search !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except exactly /login and /signup, Next's assets and static files.
  matcher: [
    "/((?!(?:login|signup)(?:/|$)|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
