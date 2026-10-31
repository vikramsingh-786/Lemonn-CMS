"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const INPUT =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm font-normal focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** A labelled text/email input for the sign-in and sign-up forms. */
export function TextField({
  name,
  label,
  type = "text",
  autoComplete,
  autoFocus,
  invalid,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: "text" | "email";
  autoComplete: string;
  autoFocus?: boolean;
  invalid: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        defaultValue={defaultValue}
        autoCapitalize={type === "email" ? "none" : undefined}
        spellCheck={false}
        required
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "auth-error" : undefined}
        className={INPUT}
      />
    </div>
  );
}

/** Password input with a show/hide button (the button never submits the form). */
export function PasswordField({
  name,
  label,
  autoComplete,
  invalid,
  hint,
}: {
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  invalid: boolean;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={
            [invalid && "auth-error", hint && `${name}-hint`].filter(Boolean).join(" ") || undefined
          }
          className={`${INPUT} pr-11`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={name}
          title={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {visible ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </button>
      </div>
      {hint && (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p id="auth-error" role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}
