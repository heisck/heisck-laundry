import { redirect } from "next/navigation";

import { getOptionalUser } from "@/lib/auth";

import { AdminLoginForm } from "./admin-login-form";

export default async function AdminLoginPage() {
  const user = await getOptionalUser();
  if (user) {
    redirect("/admin");
  }

  return <AdminLoginForm />;
}
