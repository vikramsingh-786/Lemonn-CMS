import { redirect } from "next/navigation";

/** Moved to /runs (admins see every run there, team members their own). */
export default function OldRunsPage() {
  redirect("/runs");
}
