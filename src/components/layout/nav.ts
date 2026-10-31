import { FileText, LayoutDashboard, Search, type LucideIcon } from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon; current: boolean };

/** Shared by the top pill nav and the left icon rail. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, current: true },
  { label: "Research", href: "/#sources", icon: Search, current: false },
  { label: "Articles", href: "/#articles", icon: FileText, current: false },
];
