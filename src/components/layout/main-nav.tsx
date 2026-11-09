"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isCurrent } from "@/components/layout/nav";
import { cn } from "@/lib/utils";

/** The header's nav pills; the current page is marked from the URL. */
export function MainNavLinks({ pillClassName }: { pillClassName: string }) {
  // The current page streams in (usePathname is request data); until then nothing is marked.
  return (
    <Suspense fallback={<Links pathname="" pillClassName={pillClassName} />}>
      <CurrentLinks pillClassName={pillClassName} />
    </Suspense>
  );
}

function CurrentLinks({ pillClassName }: { pillClassName: string }) {
  return <Links pathname={usePathname()} pillClassName={pillClassName} />;
}

function Links({ pathname, pillClassName }: { pathname: string; pillClassName: string }) {
  return (
    <ul className="flex gap-2">
      {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
        const current = isCurrent(href, pathname);
        return (
          <li key={label}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className={cn(
                pillClassName,
                // Labels show from laptop width; phones and tablets get icon-only pills.
                "text-sm whitespace-nowrap lg:pr-4 text-muted-foreground hover:text-foreground aria-[current=page]:text-foreground",
              )}
            >
              <span
                className={cn(
                  "pill-raised grid size-8 place-items-center rounded-full",
                  current ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                <Icon aria-hidden className="size-4" />
              </span>
              <span className="hidden lg:inline">{label}</span>
              <span className="sr-only lg:hidden">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
