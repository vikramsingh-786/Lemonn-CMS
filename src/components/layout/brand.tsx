import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-brand font-display text-sm font-bold text-brand-foreground",
        className,
      )}
    >
      L
    </span>
  );
}
