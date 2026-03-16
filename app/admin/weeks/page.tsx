import { redirect } from "next/navigation";

import { requirePageUser } from "@/lib/auth";

export default async function AdminWeeksPage() {
  await requirePageUser();
  redirect("/admin/private");
}
