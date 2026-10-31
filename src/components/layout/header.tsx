import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { BrandMark } from "@/components/layout/brand";
import { NAV_ITEMS } from "@/components/layout/nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

const PILL =
  "pill-raised flex shrink-0 items-center gap-2.5 rounded-full bg-card py-1.5 pr-1.5 pl-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function Header() {
  return (
    <header className="header-surface sticky top-0 z-40">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6">
        <Link
          href="/"
          aria-label="Lemonn Newsroom dashboard"
          // Very narrow phones (< 360 px): the Dashboard icon links home, so the logo makes room.
          className={cn(PILL, "max-[359px]:hidden sm:pr-4")}
        >
          <BrandMark />
          {/* Phones show only the logo, so the nav icons fit beside it. */}
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="font-display text-sm font-semibold tracking-tight">
              Lemonn Newsroom
            </span>
            <span className="text-[11px] text-muted-foreground">Financial News CMS</span>
          </span>
        </Link>

        <nav aria-label="Main" className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
          <ul className="flex gap-2">
            {NAV_ITEMS.map(({ label, href, icon: Icon, current }) => (
              <li key={label}>
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    PILL,
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
            ))}
          </ul>
        </nav>

        <span className="pill-raised hidden items-center gap-2 rounded-full bg-card py-2 pr-4 pl-3 text-xs text-muted-foreground md:flex">
          <span aria-hidden className="size-2 rounded-full bg-hot" />
          Prototype
        </span>
        <ThemeToggle />
        <form action={logout}>
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="pill-raised grid size-11 shrink-0 place-items-center rounded-full bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <LogOut className="size-5" aria-hidden />
          </button>
        </form>
      </div>
    </header>
  );
}
