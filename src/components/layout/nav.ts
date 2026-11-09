import { FileText, LayoutDashboard, ListChecks, Search, type LucideIcon } from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon };

/** Shared by the top pill nav and the left icon rail. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Research", href: "/#sources", icon: Search },
  { label: "Articles", href: "/articles", icon: FileText },
  { label: "Runs", href: "/runs", icon: ListChecks },
];

/** The nav item for the page at `pathname` ("Research" is a section of the dashboard, never a page). */
export function isCurrent(href: string, pathname: string): boolean {
  if (href.includes("#")) return false;
  if (href === "/") return pathname === "/" || pathname.startsWith("/research/");
  return pathname === href || pathname.startsWith(`${href}/`);
}
