import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { SideRail } from "@/components/layout/side-rail";
import { Dashboard } from "@/features/dashboard/dashboard";

export default function Home() {
  return (
    <>
      <Header />
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 gap-6 px-3 pt-2 pb-6 sm:px-6">
        <SideRail />
        <main className="app-canvas flex min-w-0 flex-1 flex-col gap-5 rounded-[28px] bg-canvas p-4 sm:rounded-[32px] sm:p-6 lg:p-7">
          <Dashboard />
        </main>
      </div>
      <Footer />
    </>
  );
}
