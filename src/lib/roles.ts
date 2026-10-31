/**
 * Roles and what they may do. Grant a role by changing User.role in the database
 * (or `pnpm user:role <email> <role>`). Unknown values count as "user" (read-only).
 */
export const ROLES = ["admin", "team", "user"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  /** Start, continue, cancel and retry research runs (spends API credits). */
  | "research:run"
  /** Open drafts as articles, edit them, mark ready or rejected. */
  | "articles:edit"
  /** See the list of accounts. */
  | "users:view";

const GRANTS: Record<Role, readonly Permission[]> = {
  admin: ["research:run", "articles:edit", "users:view"],
  team: ["research:run", "articles:edit"],
  user: [],
};

export function toRole(value: string): Role {
  return (ROLES as readonly string[]).includes(value) ? (value as Role) : "user";
}

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  team: "Team",
  user: "Read-only",
};

/** The signed-in account as pages and components see it (never the password hash). */
export type SessionUser = { id: string; email: string; name: string; role: Role };
