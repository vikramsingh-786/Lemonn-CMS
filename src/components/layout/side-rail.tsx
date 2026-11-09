"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isCurrent } from "@/components/layout/nav";
import { cn } from "@/lib/utils";

/** Desktop-only vertical icon rail mirroring the main nav. */
export function SideRail() {
  // The current page streams in (usePathname is request data); until then nothing is marked.
  return (
    <Suspense fallback={<Rail pathname="" />}>
      <CurrentRail />
    </Suspense>
  );
}

function CurrentRail() {
  return <Rail pathname={usePathname()} />;
}

function Rail({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Quick navigation"
      className="surface-raised sticky top-24 hidden h-fit flex-col gap-3 rounded-full bg-card p-2 lg:flex"
    >
      {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
        const current = isCurrent(href, pathname);
        return (
          <Link
            key={label}
            href={href}
            title={label}
            aria-label={label}
            aria-current={current ? "page" : undefined}
            className={cn(
              "pill-raised grid size-12 place-items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              current
                ? "bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_var(--primary)]"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-5" />
          </Link>
        );
      })}
    </nav>
  );
}
