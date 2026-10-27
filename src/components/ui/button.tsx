import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // 3D pills (see .btn-3d in globals.css)
        default: "btn-3d btn-3d-primary font-semibold text-primary-foreground",
        outline: "btn-3d btn-3d-neutral text-foreground",
        // Flat, for icon-only/tertiary actions
        ghost: "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
      },
      size: {
        default: "h-10 px-5 [--depth:3px]",
        sm: "h-9 px-4 text-xs [--depth:2px]",
        lg: "h-14 px-8 text-base [--depth:4px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Small spaced caps label above the main text, e.g. "Last 24 hours". */
    eyebrow?: string;
  };

export function Button({
  className,
  variant,
  size,
  eyebrow,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), eyebrow && "h-auto py-2.5", className)}
      {...props}
    >
      {eyebrow ? (
        <span className="flex flex-col items-center leading-tight">
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase opacity-65">
            {eyebrow}
          </span>
          <span className="flex items-center gap-2">{children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
