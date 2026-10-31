import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/users", label: "Accounts" },
  { href: "/admin/runs", label: "Research runs" },
] as const;

/** Switches between the admin pages. */
export function AdminTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Admin" className="flex gap-2">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            t.href === active
              ? "pill-raised bg-card text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
