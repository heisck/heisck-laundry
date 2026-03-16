import { cookies } from "next/headers";

import { requirePageUser } from "@/lib/auth";
import {
  isPrivateAccessCookieValueValid,
  PRIVATE_ACCESS_COOKIE_NAME,
} from "@/lib/private-access";

import { PrivateAccessGate } from "./private-access-gate";
import { PrivatePageClient } from "./private-page-client";

export default async function AdminPrivatePage() {
  const user = await requirePageUser();
  const cookieStore = await cookies();
  const hasAccess = await isPrivateAccessCookieValueValid(
    cookieStore.get(PRIVATE_ACCESS_COOKIE_NAME)?.value,
  );

  if (!hasAccess) {
    return <PrivateAccessGate userEmail={user.email ?? "admin"} />;
  }

  return <PrivatePageClient userEmail={user.email ?? "admin"} />;
}
