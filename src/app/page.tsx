import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Dashboard } from "@/features/dashboard/dashboard";
import { requireUser } from "@/lib/auth";

async function Home() {
  const user = await requireUser("/");
  return <Dashboard user={user} />;
}

export default function HomePage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading dashboard…</p>}>
        <Home />
      </Suspense>
    </AppShell>
  );
}
