import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard, RedirectIfSignedIn } from "./auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Lemonn Newsroom" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthCard title="Sign in" intro="Use your newsroom account.">
      <Suspense fallback={null}>
        <RedirectIfSignedIn searchParams={searchParams} />
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
