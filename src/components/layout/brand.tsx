import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md bg-brand text-sm font-bold text-brand-foreground",
        className,
      )}
    >
      L
    </span>
  );
}
