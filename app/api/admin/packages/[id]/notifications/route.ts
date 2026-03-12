import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import {
  getPackageById,
  getPackageNotifications,
} from "@/lib/services/packages";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await params;
    await getPackageById(id);
    const notifications = await getPackageNotifications(id);
    return NextResponse.json({ notifications });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await params;
    const { retryPackageNotifications } = await import("@/lib/services/packages");
    const result = await retryPackageNotifications(id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
