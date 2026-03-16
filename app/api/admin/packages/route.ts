import { after, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { invalidateAdminPackagesCache } from "@/lib/services/admin-packages";
import {
  createPackage,
  invalidatePackagesListCache,
  listPackages,
  sendCreatedPackageNotifications,
} from "@/lib/services/packages";
import {
  LAUNDRY_WORKERS,
  PACKAGE_STATUSES,
  PACKAGE_TYPES,
  PAYMENT_STATUSES,
} from "@/lib/types";

const createPackageSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  roomNumber: z.string().trim().min(1).max(64),
  packageType: z.enum(PACKAGE_TYPES),
  clothesCount: z.coerce.number().int().nonnegative(),
  totalWeightKg: z.coerce.number().positive(),
  primaryPhone: z.string().trim().min(1).max(20),
  secondaryPhone: z.string().trim().max(20).optional(),
  etaAt: z.string().datetime().optional(),
  workerName: z.enum(LAUNDRY_WORKERS),
});

const statusSchema = z.enum(PACKAGE_STATUSES);
const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("q")?.trim() || undefined;
    const statusInput = searchParams.get("status");
    const paymentStatusInput = searchParams.get("paymentStatus");
    const status = statusInput ? statusSchema.parse(statusInput) : undefined;
    const paymentStatus = paymentStatusInput
      ? paymentStatusSchema.parse(paymentStatusInput)
      : undefined;

    const packages = await listPackages({ search, status, paymentStatus });
    return NextResponse.json({ packages });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const json = await request.json();
    const parsed = createPackageSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid package payload.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await createPackage(parsed.data, auth.user.id, {
      sendNotifications: false,
    });
    invalidateAdminPackagesCache();

    after(async () => {
      try {
        await sendCreatedPackageNotifications(result.package, result.trackingUrl);
      } catch (error) {
        console.error("[packages] background create notification failed", error);
      } finally {
        invalidatePackagesListCache();
        invalidateAdminPackagesCache();
      }
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
