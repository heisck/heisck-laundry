import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { invalidateAdminPackagesCache } from "@/lib/services/admin-packages";
import {
  invalidatePackagesListCache,
  updatePackagePaymentStatus,
} from "@/lib/services/packages";

const bodySchema = z.object({
  paymentStatus: z.enum(["UNPAID", "PAID"]),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payment payload." },
        { status: 400 },
      );
    }

    const { id } = await params;
    const packageRecord = await updatePackagePaymentStatus(
      id,
      parsed.data.paymentStatus,
    );

    invalidatePackagesListCache();
    invalidateAdminPackagesCache();

    return NextResponse.json({ package: packageRecord });
  } catch (error) {
    return handleApiError(error);
  }
}
