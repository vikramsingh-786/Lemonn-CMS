import Link from "next/link";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { AccountChip } from "@/components/layout/account-chip";
import { BrandMark } from "@/components/layout/brand";
import { MainNavLinks } from "@/components/layout/main-nav";
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
          <MainNavLinks pillClassName={PILL} />
        </nav>

        <span className="pill-raised hidden items-center gap-2 rounded-full bg-card py-2 pr-4 pl-3 text-xs text-muted-foreground md:flex">
          <span aria-hidden className="size-2 rounded-full bg-hot" />
          Prototype
        </span>
        <ThemeToggle />
        <Suspense fallback={null}>
          <AccountChip />
        </Suspense>
        {/* Phones: sign out from the account page (keeps the header from overflowing). */}
        <form action={logout} className="hidden md:block">
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
