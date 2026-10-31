"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/app/login/auth-fields";
import { changePassword, signOutOtherDevices, type AccountState } from "./actions";

const INITIAL: AccountState = { error: null, done: null };

function Result({ state }: { state: AccountState }) {
  if (state.error)
    return (
      <p id="auth-error" role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  if (state.done)
    return (
      <p role="status" className="text-sm text-success">
        {state.done}
      </p>
    );
  return null;
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, INITIAL);
  return (
    <form action={action} className="flex max-w-sm flex-col gap-4">
      <PasswordField
        name="current"
        label="Current password"
        autoComplete="current-password"
        invalid={Boolean(state.error)}
      />
      <PasswordField
        name="next"
        label="New password"
        autoComplete="new-password"
        invalid={Boolean(state.error)}
        hint="At least 10 characters. Your other devices will be signed out."
      />
      <Result state={state} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}

export function SignOutOthersForm() {
  const [state, action, pending] = useActionState(signOutOtherDevices, INITIAL);
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <Result state={state} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Sign out other devices
      </Button>
    </form>
  );
}
