import { cacheLife } from "next/cache";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { BrandMark } from "@/components/layout/brand";

async function currentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

export async function Footer() {
  const year = await currentYear();

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <BrandMark className="size-6 text-xs" />
          <div className="leading-tight">
            <p className="font-medium">Lemonn Newsroom</p>
            <p className="text-xs text-muted-foreground">
              Internal Financial News Workspace · © {year}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <nav aria-label="Footer" className="flex gap-4 text-muted-foreground">
            <Link
              href="/"
              className="rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Dashboard
            </Link>
            <Link
              href="/articles"
              className="rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Articles
            </Link>
          </nav>
          <Badge variant="warning">Prototype</Badge>
        </div>
      </div>
    </footer>
  );
}
