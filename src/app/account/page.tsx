import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogOut, Users } from "lucide-react";
import { logout } from "@/app/login/actions";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL, can } from "@/lib/roles";
import { ChangePasswordForm, SignOutOthersForm } from "./account-forms";

export const metadata: Metadata = { title: "Account · Lemonn Newsroom" };

const ROLE_HELP = {
  admin: "You can run research, edit and approve articles, and see all accounts.",
  team: "You can run research and edit, approve or reject articles.",
  user: "You can read the dashboard, research and articles. Ask an admin for editing access.",
} as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface-raised rounded-lg border border-border bg-card p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

async function Account() {
  const user = await requireUser("/account");
  return (
    <>
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Account</h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">{user.email}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <Section title="Profile and access">
          <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{user.name}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="break-all">{user.email}</dd>
            <dt className="text-muted-foreground">Role</dt>
            <dd>
              <Badge variant={user.role === "user" ? "neutral" : "success"}>
                {ROLE_LABEL[user.role]}
              </Badge>
            </dd>
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">{ROLE_HELP[user.role]}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {can(user.role, "users:view") && (
              <Link
                href="/admin/users"
                className="pill-raised inline-flex h-9 items-center gap-2 rounded-full bg-muted px-4 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Users aria-hidden className="size-4" />
                All accounts
              </Link>
            )}
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                <LogOut aria-hidden />
                Sign out
              </Button>
            </form>
          </div>
        </Section>
        <div className="flex flex-col gap-5">
          <Section title="Change password">
            <ChangePasswordForm />
          </Section>
          <Section title="Other devices">
            <p className="mb-3 text-sm text-muted-foreground">
              Signed in somewhere you no longer use? This signs out everywhere except here.
            </p>
            <SignOutOthersForm />
          </Section>
        </div>
      </div>
    </>
  );
}

export default function AccountPage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading account…</p>}>
        <Account />
      </Suspense>
    </AppShell>
  );
}
