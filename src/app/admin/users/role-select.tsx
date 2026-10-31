"use client";

import { useState, useTransition } from "react";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/roles";
import { setRole } from "./actions";

/** Changes one account's role as soon as a new one is picked; reverts and explains on failure. */
export function RoleSelect({ userId, name, role }: { userId: string; name: string; role: Role }) {
  const [value, setValue] = useState(role);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: Role) {
    if (next === "admin" && !window.confirm(`Make ${name} an admin? Admins can change roles.`))
      return;
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await setRole(userId, next).catch(() => ({
        error: "Couldn't save. Try again.",
      }));
      if (result.error) {
        setValue(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={`Role for ${name}`}
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value as Role)}
        className="rounded-xl border border-input bg-card px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
