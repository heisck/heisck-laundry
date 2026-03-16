import type { PackageStatus, PackageType } from "@/lib/types";

const STATUS_ORDER: Record<PackageStatus, number> = {
  RECEIVED: 0,
  WASHING: 1,
  DRYING: 2,
  READY_FOR_PICKUP: 3,
  PICKED_UP: 4,
};

const STATUS_LABELS: Record<PackageStatus, string> = {
  RECEIVED: "Received",
  WASHING: "Washing",
  DRYING: "Drying",
  READY_FOR_PICKUP: "Ready for Pickup",
  PICKED_UP: "Picked Up",
};

const STATUS_FLOW_BY_PACKAGE: Record<PackageType, PackageStatus[]> = {
  WASH_ONLY: ["RECEIVED", "WASHING", "READY_FOR_PICKUP", "PICKED_UP"],
  NORMAL_WASH_DRY: [
    "RECEIVED",
    "WASHING",
    "DRYING",
    "READY_FOR_PICKUP",
    "PICKED_UP",
  ],
  EXPRESS_WASH_DRY: [
    "RECEIVED",
    "WASHING",
    "DRYING",
    "READY_FOR_PICKUP",
    "PICKED_UP",
  ],
};

export function isForwardTransition(
  current: PackageStatus,
  next: PackageStatus,
): boolean {
  return STATUS_ORDER[next] > STATUS_ORDER[current];
}

export function getStatusLabel(status: PackageStatus): string {
  return STATUS_LABELS[status];
}

export function getStatusFlow(packageType: PackageType): PackageStatus[] {
  return STATUS_FLOW_BY_PACKAGE[packageType];
}

export function getStatusOptionsForPackage(
  packageType: PackageType,
  current: PackageStatus,
): PackageStatus[] {
  const flow = getStatusFlow(packageType);
  const currentIndex = flow.indexOf(current);
  if (currentIndex === -1) {
    return [current];
  }

  const nextStatus = flow[currentIndex + 1];
  return nextStatus ? [current, nextStatus] : [current];
}

export function isAllowedTransition(
  packageType: PackageType,
  current: PackageStatus,
  next: PackageStatus,
): boolean {
  const options = getStatusOptionsForPackage(packageType, current);
  return options.includes(next) && next !== current;
}
