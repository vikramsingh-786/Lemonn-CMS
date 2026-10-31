/**
 * The session cookie's name. In production the __Host- prefix makes browsers require HTTPS, the
 * whole site (path=/) and no Domain attribute, so no other subdomain can set or read it.
 * Dependency-free so proxy.ts can import it.
 */
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-lemonn_session" : "lemonn_session";
