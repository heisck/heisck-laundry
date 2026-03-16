import type { PackageType } from "@/lib/types";

export const FIXED_PACKAGE_CHARGE_GHS = 2;
export const PAYSTACK_FEE_RATE = 0.01;

const PACKAGE_TYPE_DETAILS: Record<
  PackageType,
  {
    label: string;
    optionLabel: string;
    ratePerKg: number;
    turnaroundLabel: string;
    suggestedEtaHours: number;
  }
> = {
  WASH_ONLY: {
    label: "Wash Only",
    optionLabel: "Wash Only - 6 GHS/kg",
    ratePerKg: 6,
    turnaroundLabel: "Ready in about 48 hours",
    suggestedEtaHours: 48,
  },
  NORMAL_WASH_DRY: {
    label: "Normal Wash & Dry",
    optionLabel: "Normal Wash & Dry - 8 GHS/kg",
    ratePerKg: 8,
    turnaroundLabel: "Ready in 48 hours",
    suggestedEtaHours: 48,
  },
  EXPRESS_WASH_DRY: {
    label: "Express Wash & Dry",
    optionLabel: "Express Wash & Dry - 14 GHS/kg",
    ratePerKg: 14,
    turnaroundLabel: "Same day, about 6-12 hours",
    suggestedEtaHours: 12,
  },
};

export function roundUpWeightToTenth(weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return 0;
  }

  return Math.ceil(weightKg * 10) / 10;
}

export function getPackageTypeLabel(packageType: PackageType): string {
  return PACKAGE_TYPE_DETAILS[packageType].label;
}

export function getPackageTypeOptionLabel(packageType: PackageType): string {
  return PACKAGE_TYPE_DETAILS[packageType].optionLabel;
}

export function getPackageTypeRate(packageType: PackageType): number {
  return PACKAGE_TYPE_DETAILS[packageType].ratePerKg;
}

export function getPackageTypeTurnaroundLabel(packageType: PackageType): string {
  return PACKAGE_TYPE_DETAILS[packageType].turnaroundLabel;
}

export function getSuggestedEtaDate(
  packageType: PackageType,
  fromDate: Date = new Date(),
): Date {
  return new Date(
    fromDate.getTime() +
      PACKAGE_TYPE_DETAILS[packageType].suggestedEtaHours * 60 * 60 * 1000,
  );
}

export function calculatePackagePricing(
  weightKg: number,
  packageType: PackageType,
 ): {
  roundedWeightKg: number;
  ratePerKg: number;
  fixedChargeGhs: number;
  subtotalPriceGhs: number;
  paystackFeeGhs: number;
  totalPriceGhs: number;
} {
  const roundedWeightKg = roundUpWeightToTenth(weightKg);
  const ratePerKg = getPackageTypeRate(packageType);
  const subtotalPriceGhs =
    roundedWeightKg === 0
      ? 0
      : Number((roundedWeightKg * ratePerKg + FIXED_PACKAGE_CHARGE_GHS).toFixed(2));
  const paystackFeeGhs = Number((subtotalPriceGhs * PAYSTACK_FEE_RATE).toFixed(2));
  const totalPriceGhs = Number((subtotalPriceGhs + paystackFeeGhs).toFixed(2));

  return {
    roundedWeightKg,
    ratePerKg,
    fixedChargeGhs: FIXED_PACKAGE_CHARGE_GHS,
    subtotalPriceGhs,
    paystackFeeGhs,
    totalPriceGhs,
  };
}
