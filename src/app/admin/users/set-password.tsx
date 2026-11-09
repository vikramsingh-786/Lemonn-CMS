"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { PASSWORD_MIN } from "@/lib/password-rules";
import { setPassword } from "./actions";

/** Sets a new password for an account (the admin tells them it); signs them out everywhere. */
export function SetPassword({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await setPassword(userId, value).catch(() => ({
        error: "Couldn't save. Try again.",
      }));
      if (result.error) return setError(result.error);
      setValue("");
      setOpen(false);
      setDone(true);
    });
  }

  if (!open)
    return (
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen(true);
            setDone(false);
          }}
        >
          Set password
        </Button>
        {done && (
          <p role="status" className="text-xs text-muted-foreground">
            Saved. {name} was signed out; tell them the new password.
          </p>
        )}
      </div>
    );

  return (
    <form onSubmit={save} className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`New password for ${name}`}
          placeholder={`At least ${PASSWORD_MIN} characters`}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          className="h-9 w-44 min-w-0 rounded-md border border-input bg-card px-2 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        <Button type="submit" size="sm" disabled={pending || value.length < PASSWORD_MIN}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setValue("");
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
