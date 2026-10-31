import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard, RedirectIfSignedIn } from "@/app/login/auth-card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account · Lemonn Newsroom" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <AuthCard
      title="Create an account"
      intro="New accounts can read the newsroom. An admin gives editing access."
    >
      <Suspense fallback={null}>
        <RedirectIfSignedIn searchParams={searchParams} />
        <SignupForm />
      </Suspense>
    </AuthCard>
  );
}
