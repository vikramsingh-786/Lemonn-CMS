"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { AuthFormState } from "@/app/login/actions";
import { FormError, PasswordField, TextField } from "@/app/login/auth-fields";
import { signup } from "./actions";

export function SignupForm() {
  const next = useSearchParams().get("next") ?? "/";
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signup, { error: null });
  const invalid = Boolean(state.error);
  return (
    <>
      <form action={action} className="mt-6 flex flex-col gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        {/* Remount with what was typed after each attempt (React clears the form). */}
        <TextField
          key={`n${state.values?.name ?? ""}`}
          name="name"
          label="Name"
          autoComplete="name"
          autoFocus
          invalid={invalid}
          defaultValue={state.values?.name}
        />
        <TextField
          key={`e${state.values?.email ?? ""}`}
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          invalid={invalid}
          defaultValue={state.values?.email}
        />
        <PasswordField
          name="password"
          label="Password"
          autoComplete="new-password"
          invalid={invalid}
          hint="At least 10 characters. A passphrase of a few words works well."
        />
        <FormError error={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
