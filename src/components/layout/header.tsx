import Link from "next/link";
import { UserRound } from "lucide-react";
import { BrandMark } from "@/components/layout/brand";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", current: true },
  { label: "Research", href: "#sources", current: false },
  { label: "Articles", href: "#articles", current: false },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandMark />
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">Lemonn Newsroom</span>
            <span className="text-xs text-muted-foreground">Financial News CMS</span>
          </span>
        </Link>

        {/* Mobile: drops to a full-width row under the brand. Desktop: inline. */}
        <nav aria-label="Main" className="order-last -mx-2 w-full sm:order-none sm:mx-0 sm:w-auto">
          <ul className="flex gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <span
          role="img"
          aria-label="Admin profile (sign-in not configured yet)"
          title="Sign-in not configured yet"
          className="ml-auto grid size-8 place-items-center rounded-full border border-border bg-card text-muted-foreground"
        >
          <UserRound className="size-4" aria-hidden />
        </span>
      </div>
    </header>
  );
}
