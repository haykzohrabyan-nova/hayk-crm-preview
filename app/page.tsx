import { redirect } from "next/navigation";

export default function RootPage() {
  // Hayk 2026-07-12 — open the app on the Sales Pipeline (the daily driver).
  redirect("/preview/sales-pipeline");
}
