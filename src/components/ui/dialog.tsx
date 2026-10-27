"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Replaces the default "Got it" button (e.g. form actions). */
  actions?: React.ReactNode;
};

/** Modal built on native <dialog>: focus trapping, Esc to close and inert background come free. */
export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // Close when the backdrop (the dialog element itself) is clicked.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-xl backdrop:bg-black/40"
    >
      <div className="p-6">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <div className="mt-2 text-sm text-muted-foreground">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          {actions ?? (
            <Button onClick={onClose} autoFocus>
              Got it
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}
