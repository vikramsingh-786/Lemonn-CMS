"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { login, type AuthFormState } from "./actions";
import { FormError, PasswordField, TextField } from "./auth-fields";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [state, action, pending] = useActionState<AuthFormState, FormData>(login, { error: null });
  const invalid = Boolean(state.error);

  return (
    <>
      {params.get("expired") && !state.error && (
        <p
          role="status"
          className="mt-5 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground"
        >
          Your session has ended. Sign in again to continue where you left off.
        </p>
      )}
      <form action={action} className="mt-6 flex flex-col gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <TextField
          // Remount with the typed email after each attempt (React clears the form).
          key={state.values?.email ?? ""}
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          invalid={invalid}
          defaultValue={state.values?.email}
        />
        <PasswordField
          name="password"
          label="Password"
          autoComplete="current-password"
          invalid={invalid}
        />
        <FormError error={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link
          href={`/signup?next=${encodeURIComponent(next)}`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
