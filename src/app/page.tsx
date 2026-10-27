import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Dashboard } from "@/features/dashboard/dashboard";

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <Dashboard />
      </main>
      <Footer />
    </>
  );
}
