import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Sign-in gate for every page and API route except /login and static files: pages redirect to
 * /login, API calls get 401. Route handlers check the session again (requireApiSession).
 */
export async function proxy(request: NextRequest) {
  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value))
    return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/"))
    return Response.json(
      { error: { code: "unauthorized", message: "Sign in required.", retryable: false } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  const login = new URL("/login", request.url);
  if (pathname + search !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!login|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
