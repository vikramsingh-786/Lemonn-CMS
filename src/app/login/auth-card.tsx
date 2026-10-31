import { redirect } from "next/navigation";
import { BrandMark } from "@/components/layout/brand";
import { getCurrentUser, safeNextPath } from "@/lib/auth";

/** Layout shared by /login and /signup. */
export function AuthCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="surface-raised w-full max-w-sm rounded-lg border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div className="leading-tight">
            <p className="font-display text-lg font-semibold tracking-tight">Lemonn Newsroom</p>
            <p className="text-xs text-muted-foreground">Financial News CMS</p>
          </div>
        </div>
        <h1 className="mt-6 font-display text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
        {children}
      </div>
    </main>
  );
}

/** Already signed in (a valid session, not just a cookie): skip the form. */
export async function RedirectIfSignedIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const user = await getCurrentUser().catch(() => null);
  if (user) {
    const { next } = await searchParams;
    redirect(safeNextPath(typeof next === "string" ? next : "/"));
  }
  return null;
}
