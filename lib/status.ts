import type { PackageStatus } from "@/lib/types";

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

export function isForwardTransition(
  current: PackageStatus,
  next: PackageStatus,
): boolean {
  return STATUS_ORDER[next] > STATUS_ORDER[current];
}

export function getStatusLabel(status: PackageStatus): string {
  return STATUS_LABELS[status];
}
