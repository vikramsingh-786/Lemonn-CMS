"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

/** Must match the key read by the inline script in app/layout.tsx. */
export const THEME_STORAGE_KEY = "lemonn-theme";

type Theme = "light" | "dark";

const currentTheme = (): Theme =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

/** Re-render when <html data-theme> changes (from this toggle or the boot script). */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function ThemeToggle() {
  // null on the server; icons switch via CSS so server and client markup match.
  const theme = useSyncExternalStore<Theme | null>(subscribe, currentTheme, () => null);

  function toggle() {
    const next: Theme = currentTheme() === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked (private mode): the theme still applies for this page.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Dark theme"
      aria-pressed={theme === null ? undefined : theme === "dark"}
      title="Toggle light / dark theme"
      className="pill-raised grid size-11 shrink-0 place-items-center rounded-full bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Sun aria-hidden className="size-5 light:hidden" />
      <Moon aria-hidden className="hidden size-5 light:block" />
    </button>
  );
}
