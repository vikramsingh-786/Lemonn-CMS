import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { formatIst } from "@/features/dashboard/format";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABEL, can, toRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Users · Lemonn Newsroom" };

async function UsersList() {
  const me = await requireUser("/admin/users");
  if (!can(me.role, "users:view"))
    return (
      <p role="alert" className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
        Only admins can see the user list.
      </p>
    );
  const users = await db().user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      sessions: { orderBy: { lastSeenAt: "desc" }, take: 1, select: { lastSeenAt: true } },
    },
  });
  return (
    <section className="surface-raised overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">
                Name
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                Email
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                Role
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                Signed up
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                Last active
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => {
              const role = toRole(u.role);
              return (
                <tr key={u.id}>
                  <td className="px-5 py-3 font-medium">{u.name}</td>
                  <td className="px-5 py-3 break-all text-muted-foreground">{u.email}</td>
                  <td className="px-5 py-3">
                    <Badge variant={role === "user" ? "neutral" : "success"}>
                      {ROLE_LABEL[role]}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {formatIst(u.createdAt.toISOString())}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {u.sessions[0]
                      ? formatIst(u.sessions[0].lastSeenAt.toISOString())
                      : "Not signed in"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function UsersPage() {
  return (
    <AppShell>
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Users</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Everyone with an account. New accounts are read-only. To change a role, run this in the
          database (Neon SQL editor, or psql locally); it applies on their next page load:
          <code className="mt-2 block overflow-x-auto rounded-xl bg-muted px-3 py-2 text-xs">
            UPDATE &quot;User&quot; SET role = &apos;team&apos; WHERE email =
            &apos;name@example.com&apos;;
          </code>
          Roles: admin (everything, incl. this list), team (research and article editing), user
          (read-only).
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading users…</p>}>
        <UsersList />
      </Suspense>
    </AppShell>
  );
}
