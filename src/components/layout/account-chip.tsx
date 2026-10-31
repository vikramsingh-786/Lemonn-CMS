import Link from "next/link";
import { Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_LABEL, can } from "@/lib/roles";

/** Who is signed in (links to /account); admins also get the user list. */
export async function AccountChip() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return null;
  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <>
      {can(user.role, "users:view") && (
        <Link
          href="/admin/users"
          aria-label="Users"
          title="Users"
          className="pill-raised hidden size-11 shrink-0 place-items-center rounded-full bg-card text-muted-foreground md:grid transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Users aria-hidden className="size-5" />
        </Link>
      )}
      <Link
        href="/account"
        title={`${user.name} · ${ROLE_LABEL[user.role]}`}
        className="pill-raised flex shrink-0 items-center gap-2 rounded-full bg-card py-1.5 pr-1.5 pl-1.5 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:pr-4"
      >
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {initials || "?"}
        </span>
        <span className="hidden flex-col leading-tight md:flex">
          <span className="max-w-32 truncate text-sm font-medium">{user.name}</span>
          <span className="text-[11px] text-muted-foreground">{ROLE_LABEL[user.role]}</span>
        </span>
        <span className="sr-only md:hidden">
          Account: {user.name}, {ROLE_LABEL[user.role]}
        </span>
      </Link>
    </>
  );
}
