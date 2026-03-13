import { after, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { invalidateAdminPackagesCache } from "@/lib/services/admin-packages";
import {
  invalidatePackagesListCache,
  sendStatusPackageNotifications,
  updatePackageStatus,
} from "@/lib/services/packages";
import { LAUNDRY_WORKERS, PACKAGE_STATUSES } from "@/lib/types";

const bodySchema = z.object({
  status: z.enum(PACKAGE_STATUSES),
  workerName: z.enum(LAUNDRY_WORKERS).optional(),
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
        { error: "Invalid status payload." },
        { status: 400 },
      );
    }

    const { id } = await params;
    const result = await updatePackageStatus(
      id,
      parsed.data.status,
      auth.user.id,
      parsed.data.workerName ?? "NOBODY",
      { sendNotifications: false },
    );
    invalidateAdminPackagesCache();

    if (!result.skipped && result.package.last_delivery_state === "PENDING") {
      after(async () => {
        try {
          await sendStatusPackageNotifications(result.package, parsed.data.status);
        } catch (error) {
          console.error("[packages] background status notification failed", error);
        } finally {
          invalidatePackagesListCache();
          invalidateAdminPackagesCache();
        }
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
