import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Dashboard } from "@/features/dashboard/dashboard";
import { configuredSources } from "@/features/research/source-settings";
import { requireUser } from "@/lib/auth";

async function Home() {
  const user = await requireUser("/");
  return <Dashboard user={user} defaultSources={await configuredSources()} />;
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
