"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setDefault } from "./actions";

/** Saves a source's default as soon as it is switched; reverts and explains on failure. */
export function DefaultSwitch({
  id,
  name,
  enabled,
}: {
  id: string;
  name: string;
  enabled: boolean;
}) {
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    setOn(next);
    setError(null);
    startTransition(async () => {
      const result = await setDefault(id, next).catch(() => ({
        error: "Couldn't save. Try again.",
      }));
      if (result.error) {
        setOn(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Switch
        checked={on}
        onCheckedChange={change}
        disabled={pending}
        aria-label={`${name} on by default`}
      />
      {error && (
        <p role="alert" className="max-w-48 text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
