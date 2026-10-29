import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandMark } from "@/components/layout/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Lemonn Newsroom" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="surface-raised w-full max-w-sm rounded-lg border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div className="leading-tight">
            <h1 className="font-display text-lg font-semibold tracking-tight">Lemonn Newsroom</h1>
            <p className="text-xs text-muted-foreground">Financial News CMS</p>
          </div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Enter the newsroom password to open the dashboard.
        </p>
        {/* useSearchParams (the page to return to) needs a Suspense boundary. */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
