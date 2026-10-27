import Link from "next/link";
import { NAV_ITEMS } from "@/components/layout/nav";
import { cn } from "@/lib/utils";

/** Desktop-only vertical icon rail mirroring the main nav. */
export function SideRail() {
  return (
    <nav
      aria-label="Quick navigation"
      className="surface-raised sticky top-24 hidden h-fit flex-col gap-3 rounded-full bg-card p-2 lg:flex"
    >
      {NAV_ITEMS.map(({ label, href, icon: Icon, current }) => (
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
      ))}
    </nav>
  );
}
