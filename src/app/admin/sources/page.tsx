import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { configuredSources } from "@/features/research/source-settings";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { AdminTabs } from "../admin-tabs";
import { DefaultSwitch } from "./default-switch";

export const metadata: Metadata = { title: "Sources · Lemonn Newsroom" };

async function SourcesList() {
  const me = await requireUser("/admin/sources");
  if (!can(me.role, "sources:manage"))
    return (
      <p role="alert" className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
        Only admins can change the default sources.
      </p>
    );
  const sources = await configuredSources();
  return (
    <section className="surface-raised rounded-lg border border-border bg-card">
      <ul className="divide-y divide-border">
        {sources.map((s) => (
          <li key={s.id} className="flex items-start gap-4 px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {s.name}
                <Badge variant={s.paidSearch ? "warning" : "neutral"}>
                  {s.paidSearch ? "Paid search" : "News sitemap · free"}
                </Badge>
              </p>
              <p className="mt-0.5 font-mono text-xs break-all text-muted-foreground">{s.domain}</p>
              {s.note && <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>}
            </div>
            <DefaultSwitch id={s.id} name={s.name} enabled={s.enabled} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function SourcesPage() {
  return (
    <AppShell>
      <AdminTabs active="/admin/sources" />
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Sources</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Which news sources are on when anyone opens the dashboard. Editors can still switch
          sources for one run. Changes save at once.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading sources…</p>}>
        <SourcesList />
      </Suspense>
    </AppShell>
  );
}
