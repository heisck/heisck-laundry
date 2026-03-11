import { redirect } from "next/navigation";

import { requirePageUser } from "@/lib/auth";

export default async function AdminPage() {
  await requirePageUser();
  redirect("/admin/packages");
}
